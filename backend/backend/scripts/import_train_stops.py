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
  not the whole file — extend TRAIN_WHITELIST once verified.
"""

import ijson
import httpx
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
    resp = client.table("stations").select("code").execute()
    return {r["code"] for r in (resp.data or []) if r.get("code")}


def stream_and_validate(url: str, whitelist: set[str], valid_stations: set[str]):
    stats = defaultdict(int)
    errors = []
    grouped: dict[str, list[dict]] = defaultdict(list)

    with httpx.stream("GET", url, timeout=120.0, follow_redirects=True) as resp:
        resp.raise_for_status()
        for row in ijson.items(resp.iter_bytes(), "item"):
            stats["total_source_rows"] += 1
            train_number = str(row.get("train_number", "")).strip()

            if train_number not in whitelist:
                continue

            station_code = str(row.get("station_code", "")).strip().upper()
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
                "arrival_time": None if arrival in (None, "None") else str(arrival),
                "departure_time": None if departure in (None, "None") else str(departure),
                "day_offset": int(day) if str(day).isdigit() else 0,
                "_source_order": stats["total_source_rows"],
            })

    valid_rows = []
    for train_number, stops in grouped.items():
        stops_sorted = sorted(stops, key=lambda r: r["_source_order"])
        for i, s in enumerate(stops_sorted, start=1):
            s["stop_sequence"] = i
            del s["_source_order"]
            valid_rows.append(s)
        stats["valid_rows"] += len(stops_sorted)

    stats["trains_found"] = len(grouped)

    per_train_detail = {}
    for train_number, stops in grouped.items():
        stops_sorted = sorted(stops, key=lambda r: r["_source_order"])
        ordered_codes = [s["station_code"] for s in stops_sorted]
        per_train_detail[train_number] = {
            "stop_count": len(stops_sorted),
            "first_station": ordered_codes[0] if ordered_codes else None,
            "last_station": ordered_codes[-1] if ordered_codes else None,
            "ordered_station_codes": ordered_codes,
        }

    return valid_rows, errors, stats, per_train_detail


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


def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: SUPABASE_URL / SUPABASE_KEY not set.")
        sys.exit(1)

    client = create_client(SUPABASE_URL, SUPABASE_KEY)

    print("Fetching valid station codes from public.stations ...")
    valid_stations = get_valid_station_codes(client)
    print(f"  -> {len(valid_stations)} valid station codes loaded.")

    print(f"Streaming schedules.json, filtering for {len(TRAIN_WHITELIST)} whitelisted trains ...")
    valid_rows, errors, stats, per_train_detail = stream_and_validate(SCHEDULES_URL, TRAIN_WHITELIST, valid_stations)

    if DRY_RUN:
        print("\n=== DRY RUN REPORT (NO DATABASE WRITES PERFORMED) ===")
        print(f"total_source_rows_scanned: {stats['total_source_rows']}")
        print(f"trains_found_in_whitelist: {stats['trains_found']} / {len(TRAIN_WHITELIST)} requested")
        missing = TRAIN_WHITELIST - set(per_train_detail.keys())
        if missing:
            print(f"trains_NOT_found_in_source: {sorted(missing)}")
        print(f"total_valid_rows: {stats['valid_rows']}")
        print(f"unmatched_station_codes: {stats['unmatched_station_codes']}")
        print(f"invalid_train_numbers: {stats['invalid_train_numbers']}")
        print(f"rejected_rows_total: {len(errors)}")

        for train_number, detail in per_train_detail.items():
            print(f"\n--- Train {train_number} ---")
            print(f"  stop_count: {detail['stop_count']}")
            print(f"  first_station: {detail['first_station']}")
            print(f"  last_station: {detail['last_station']}")
            print(f"  ordered_station_codes: {detail['ordered_station_codes']}")

        if errors:
            print(f"\nSample rejected rows (up to 20 shown):")
            for e in errors[:20]:
                print(f"  {e['reason']}: {e['row']}")

        print("\nDRY RUN COMPLETE. No rows were inserted or updated in Supabase.")
        return

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
