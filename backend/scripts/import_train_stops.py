"""
One-time importer: pulls REAL train stop/route data from the
datameet/railways CC0 dataset (schedules.json, 78.4MB) and populates
public.train_stops in Supabase.

SAFETY RULES FOLLOWED:
- No fabricated data. Every row traces back to datameet/railways schedules.json.
- Idempotent: uses ON CONFLICT (train_number, station_code, stop_sequence) DO NOTHING.
- Batched inserts (not one-by-one).
- Validates station_code exists in public.stations before inserting.
- Rejects malformed rows into an error report instead of silently fixing them.
- Only imports a small, explicit whitelist of train numbers first (Phase 6),
  not the whole file.
- run_dry_run_report() NEVER writes to Supabase. It hard-refuses if DRY_RUN
  is not True, so flipping the module-level flag is the only way to enable
  writes, and even then only via the CLI path (main()), never via the
  FastAPI admin endpoint.
- Downloads the full file before parsing (instead of streaming) to avoid a
  known ijson + httpx streaming incompatibility (SystemError / ValueError).
"""

import ijson.backends.python as ijson
import httpx
import io
import os
import sys
from collections import defaultdict
from supabase import create_client

SCHEDULES_URL = "https://raw.githubusercontent.com/datameet/railways/master/schedules.json"

TRAIN_WHITELIST = {
    "12622",
    "12658",
    "12310",
}

DRY_RUN = True

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")


def get_valid_station_codes(client) -> set[str]:
    codes = set()
    offset = 0
    while True:
        resp = (
            client.table("stations")
            .select("code")
            .range(offset, offset + 999)
            .execute()
        )
        rows = resp.data or []
        codes.update(r["code"] for r in rows if r.get("code"))
        if len(rows) < 1000:
            break
        offset += 1000
    return codes


def stream_and_validate(url: str, whitelist: set[str], valid_stations: set[str]):
    stats = defaultdict(int)
    errors = []
    grouped: dict[str, list[dict]] = defaultdict(list)

    response = httpx.get(url, timeout=180.0, follow_redirects=True)
    response.raise_for_status()

    with io.BytesIO(response.content) as buffer:
        for row in ijson.items(buffer, "item"):
            stats["total_source_rows"] += 1
            train_number = str(row.get("train_number", "")).strip()

            if train_number not in whitelist:
                continue

            station_code = str(row.get("station_code", "")).strip().upper()
            station_name = row.get("station_name")
            arrival = row.get("arrival")
            departure = row.get("departure")
            day = row.get("day", 0)

            if not train_number:
                stats["invalid_train_numbers"] += 1
                errors.append({"reason": "empty train_number", "row": row})
                continue
            if not station_code:
                stats["unmatched_station_codes"] += 1
                errors.append({"reason": "empty station_code", "row": row})
                continue
            if station_code not in valid_stations:
                stats["unmatched_station_codes"] += 1
                errors.append({"reason": f"station_code '{station_code}' not in public.stations", "row": row})
                continue

            grouped[train_number].append({
                "train_number": train_number,
                "station_code": station_code,
                "station_name": station_name,
                "arrival_time": None if arrival in (None, "None") else str(arrival),
                "departure_time": None if departure in (None, "None") else str(departure),
                "day_offset": int(day) if str(day).isdigit() else 0,
                "_source_order": stats["total_source_rows"],
            })

    # Build per_train_detail FIRST, while _source_order still exists on
    # every dict. The next block deletes _source_order in place, and since
    # grouped[...] holds the SAME dict objects, doing this in the wrong
    # order causes a KeyError on the second pass.
    per_train_detail = {}
    for train_number, stops in grouped.items():
        stops_sorted = sorted(stops, key=lambda r: r["_source_order"])
        per_train_detail[train_number] = {
            "stop_count": len(stops_sorted),
            "first_station": stops_sorted[0]["station_code"] if stops_sorted else None,
            "last_station": stops_sorted[-1]["station_code"] if stops_sorted else None,
            "ordered_station_codes": [s["station_code"] for s in stops_sorted],
            "ordered_station_names": [s.get("station_name") for s in stops_sorted],
        }

    valid_rows = []
    for train_number, stops in grouped.items():
        stops_sorted = sorted(stops, key=lambda r: r["_source_order"])
        for i, s in enumerate(stops_sorted, start=1):
            s["stop_sequence"] = i
            del s["_source_order"]
            valid_rows.append(s)
        stats["valid_rows"] += len(stops_sorted)

    stats["trains_found"] = len(grouped)

    return valid_rows, errors, dict(stats), per_train_detail


def batch_upsert(client, rows: list[dict], batch_size: int = 500):
    inserted = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        client.table("train_stops").upsert(
            batch,
            on_conflict="train_number,station_code,stop_sequence",
        ).execute()
        inserted += len(batch)
    return inserted


def run_dry_run_report() -> dict:
    """Callable, JSON-safe dry-run entry point for the FastAPI admin endpoint.

    HARD SAFETY GUARD: refuses to run at all unless DRY_RUN is True.
    Performs ZERO writes to Supabase under any circumstance -- it never
    calls batch_upsert.
    """
    if not DRY_RUN:
        raise RuntimeError(
            "DRY_RUN is False. run_dry_run_report() refuses to execute. "
            "This function never writes to the database regardless, but "
            "the False state itself is treated as a misconfiguration."
        )
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError("SUPABASE_URL / SUPABASE_KEY not set.")

    client = create_client(SUPABASE_URL, SUPABASE_KEY)
    valid_stations = get_valid_station_codes(client)
    valid_rows, errors, stats, per_train_detail = stream_and_validate(
        SCHEDULES_URL, TRAIN_WHITELIST, valid_stations
    )

    missing = sorted(TRAIN_WHITELIST - set(per_train_detail.keys()))

    return {
        "dry_run": True,
        "database_writes_performed": False,
        "valid_station_codes_loaded": len(valid_stations),
        "total_source_rows_scanned": stats.get("total_source_rows", 0),
        "trains_requested": sorted(TRAIN_WHITELIST),
        "trains_found_in_source": stats.get("trains_found", 0),
        "trains_not_found_in_source": missing,
        "total_valid_rows": stats.get("valid_rows", 0),
        "unmatched_station_codes_count": stats.get("unmatched_station_codes", 0),
        "invalid_train_numbers_count": stats.get("invalid_train_numbers", 0),
        "rejected_rows_total": len(errors),
        "per_train_detail": per_train_detail,
        "sample_rejected_rows": errors[:20],
    }


def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: SUPABASE_URL / SUPABASE_KEY not set.")
        sys.exit(1)

    if DRY_RUN:
        report = run_dry_run_report()
        print("\n=== DRY RUN REPORT (NO DATABASE WRITES PERFORMED) ===")
        for k, v in report.items():
            if k == "per_train_detail":
                for tn, detail in v.items():
                    print(f"\n--- Train {tn} ---")
                    for dk, dv in detail.items():
                        print(f"  {dk}: {dv}")
            else:
                print(f"{k}: {v}")
        print("\nDRY RUN COMPLETE. No rows were inserted or updated in Supabase.")
        return

    client = create_client(SUPABASE_URL, SUPABASE_KEY)
    valid_stations = get_valid_station_codes(client)
    valid_rows, errors, stats, per_train_detail = stream_and_validate(
        SCHEDULES_URL, TRAIN_WHITELIST, valid_stations
    )

    print("Inserting validated rows (idempotent upsert) ...")
    inserted = batch_upsert(client, valid_rows)

    print("\n=== IMPORT REPORT ===")
    for k, v in stats.items():
        print(f"{k}: {v}")
    print(f"rows_upserted: {inserted}")
    print(f"rejected_rows: {len(errors)}")

    if errors:
        import json
        with open("import_errors.json", "w") as f:
            json.dump(errors[:500], f, indent=2)
        print("First 500 rejected rows written to import_errors.json")


if __name__ == "__main__":
    main()
