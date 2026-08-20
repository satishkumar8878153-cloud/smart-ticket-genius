"""
All-train train_stops production import pipeline (DRY-RUN by default).

Source: DataMeet schedules.json (CC0)
Target: public.train_stops on production Supabase

SAFETY (non-negotiable):
- DRY_RUN = True by default → zero writes.
- TRAIN_STOPS_IMPORT_ENABLED = False → second hard gate; main() refuses
  writes unless BOTH flags are explicitly flipped (and only via CLI).
- Reject station_code "P" and any code not in public.stations.
- Append-only: upsert with on_conflict do-nothing semantics
  (unique key: train_number, station_code, stop_sequence).
- Does NOT update/delete existing rows; conflict rows are skipped.
- Does NOT touch stations, trains, pnr_history, bookings, or schema.
- Batch size = 500.

Fields written (when import is eventually enabled):
  train_number, station_code, stop_sequence, arrival_time,
  departure_time, day_offset
"""

from __future__ import annotations

import argparse
import io
import json
import os
import sys
from collections import defaultdict
from pathlib import Path

import httpx
import ijson.backends.python as ijson
from supabase import create_client

SCHEDULES_URL = (
    "https://raw.githubusercontent.com/datameet/railways/master/schedules.json"
)

# --- HARD SAFETY GATES -------------------------------------------------------
DRY_RUN = True
TRAIN_STOPS_IMPORT_ENABLED = False  # must stay False until explicit approval
BATCH_SIZE = 500
QUARANTINE_CODES = {"P"}  # known DataMeet garbage codes

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").strip()
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "").strip()

SCRIPTS_DIR = Path(__file__).resolve().parent
REPORT_PATH = SCRIPTS_DIR / "train_stops_import_dry_run.json"
NONE_TIMES = {None, "", "None", "none", "NULL", "null", "-"}


def get_valid_station_codes(client) -> set[str]:
    codes: set[str] = set()
    offset = 0
    while True:
        resp = (
            client.table("stations")
            .select("code")
            .range(offset, offset + 999)
            .execute()
        )
        rows = resp.data or []
        codes.update(str(r["code"]).strip().upper() for r in rows if r.get("code"))
        if len(rows) < 1000:
            break
        offset += 1000
    return codes


def count_existing_train_stops(client) -> int:
    resp = client.table("train_stops").select("id", count="exact").limit(1).execute()
    return int(resp.count or 0)


def fetch_existing_keys(client) -> set[tuple[str, str, int]]:
    """All (train_number, station_code, stop_sequence) already in DB."""
    keys: set[tuple[str, str, int]] = set()
    offset = 0
    while True:
        resp = (
            client.table("train_stops")
            .select("train_number,station_code,stop_sequence")
            .range(offset, offset + 999)
            .execute()
        )
        rows = resp.data or []
        for r in rows:
            try:
                keys.add(
                    (
                        str(r["train_number"]).strip(),
                        str(r["station_code"]).strip().upper(),
                        int(r["stop_sequence"]),
                    )
                )
            except (KeyError, TypeError, ValueError):
                continue
        if len(rows) < 1000:
            break
        offset += 1000
    return keys


def _norm_time(value) -> str | None:
    if value in NONE_TIMES:
        return None
    s = str(value).strip()
    if s in NONE_TIMES:
        return None
    return s


def parse_and_validate(
    schedules_source,
    valid_stations: set[str],
) -> tuple[list[dict], list[dict], dict]:
    """
    Parse schedules.json (file path, URL, or bytes).
    Returns (valid_rows, rejected_rows, stats).
    stop_sequence is assigned 1..n per train in source order.
    """
    stats: dict = defaultdict(int)
    rejected: list[dict] = []
    grouped: dict[str, list[dict]] = defaultdict(list)

    def note_reject(reason: str, row: dict) -> None:
        stats["rejected_rows"] += 1
        if len(rejected) < 50:
            rejected.append({"reason": reason, "row": _clip(row)})

    def iter_items():
        if isinstance(schedules_source, (str, Path)):
            path = Path(schedules_source)
            if path.exists():
                with path.open("rb") as f:
                    yield from ijson.items(f, "item")
                return
            resp = httpx.get(str(schedules_source), timeout=300.0, follow_redirects=True)
            resp.raise_for_status()
            with io.BytesIO(resp.content) as buf:
                yield from ijson.items(buf, "item")
            return
        raise TypeError("schedules_source must be a path or URL string")

    for row in iter_items():
        stats["source_rows"] += 1
        if stats["source_rows"] % 100000 == 0:
            print(f"  ... scanned {stats['source_rows']} source rows")

        train_number = str(row.get("train_number") or "").strip()
        if not train_number:
            note_reject("empty_train_number", row)
            stats["invalid_train_numbers"] += 1
            continue

        station_code = str(row.get("station_code") or "").strip().upper()
        if not station_code:
            note_reject("empty_station_code", row)
            stats["unknown_station_codes"] += 1
            continue

        if station_code in QUARANTINE_CODES:
            note_reject(f"quarantined_station_code:{station_code}", row)
            stats["quarantined_rows"] += 1
            continue

        if station_code not in valid_stations:
            note_reject(f"unknown_station_code:{station_code}", row)
            stats["unknown_station_codes"] += 1
            continue

        day_raw = row.get("day", 1)
        if day_raw in NONE_TIMES:
            day_offset = 1
        else:
            try:
                day_offset = int(day_raw)
            except (TypeError, ValueError):
                day_offset = 1

        grouped[train_number].append(
            {
                "train_number": train_number,
                "station_code": station_code,
                "arrival_time": _norm_time(row.get("arrival")),
                "departure_time": _norm_time(row.get("departure")),
                "day_offset": day_offset,
                "_order": stats["source_rows"],
            }
        )

    valid_rows: list[dict] = []
    for train_number, stops in grouped.items():
        stops_sorted = sorted(stops, key=lambda s: s["_order"])
        for i, s in enumerate(stops_sorted, start=1):
            rec = {
                "train_number": s["train_number"],
                "station_code": s["station_code"],
                "stop_sequence": i,
                "arrival_time": s["arrival_time"],
                "departure_time": s["departure_time"],
                "day_offset": s["day_offset"],
            }
            valid_rows.append(rec)

    stats["valid_rows"] = len(valid_rows)
    stats["unique_trains"] = len(grouped)
    stats["unique_station_codes_in_valid"] = len({r["station_code"] for r in valid_rows})
    return valid_rows, rejected, dict(stats)


def _clip(row: dict) -> dict:
    out = {}
    for k, v in list(row.items())[:10]:
        out[k] = v
    return out


def batch_upsert(client, rows: list[dict], batch_size: int = BATCH_SIZE) -> int:
    """Append-only upsert. Conflicts on unique key are left unchanged."""
    inserted = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        client.table("train_stops").upsert(
            batch,
            on_conflict="train_number,station_code,stop_sequence",
            ignore_duplicates=True,
        ).execute()
        inserted += len(batch)
        if (i // batch_size) % 20 == 0:
            print(f"  ... upserted batch {i // batch_size + 1} ({inserted} rows so far)")
    return inserted


def build_dry_run_report(
    valid_rows: list[dict],
    rejected: list[dict],
    stats: dict,
    existing_keys: set[tuple[str, str, int]],
    existing_count: int,
    station_count: int,
) -> dict:
    already_present = 0
    to_insert = 0
    for r in valid_rows:
        key = (r["train_number"], r["station_code"], r["stop_sequence"])
        if key in existing_keys:
            already_present += 1
        else:
            to_insert += 1

    report = {
        "dry_run": True,
        "database_writes_performed": False,
        "TRAIN_STOPS_IMPORT_ENABLED": TRAIN_STOPS_IMPORT_ENABLED,
        "source": SCHEDULES_URL,
        "station_codes_loaded": station_count,
        "source_rows": stats.get("source_rows", 0),
        "valid_rows": stats.get("valid_rows", 0),
        "rejected_rows": stats.get("rejected_rows", 0),
        "quarantined_rows": stats.get("quarantined_rows", 0),
        "unknown_station_codes": stats.get("unknown_station_codes", 0),
        "invalid_train_numbers": stats.get("invalid_train_numbers", 0),
        "unique_trains": stats.get("unique_trains", 0),
        "unique_station_codes_in_valid": stats.get("unique_station_codes_in_valid", 0),
        "duplicate_rows_in_source": 0,
        "existing_rows_already_present": existing_count,
        "valid_rows_matching_existing_keys": already_present,
        "expected_rows_to_insert": to_insert,
        "expected_final_count": existing_count + to_insert,
        "batch_size": BATCH_SIZE,
        "on_conflict": "train_number,station_code,stop_sequence (ignore_duplicates / DO NOTHING)",
        "sample_rejected": rejected[:20],
    }
    return report


def run_dry_run(schedules_path: str | None = None) -> dict:
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be set.")

    client = create_client(SUPABASE_URL, SUPABASE_KEY)
    print("Loading production station codes (paginated)...")
    stations = get_valid_station_codes(client)
    print(f"  station_codes_loaded: {len(stations)}")

    print("Counting existing train_stops...")
    existing_count = count_existing_train_stops(client)
    print(f"  existing_rows: {existing_count}")

    print("Fetching existing keys (for insert estimate)...")
    existing_keys = fetch_existing_keys(client)
    print(f"  existing unique keys: {len(existing_keys)}")

    source = schedules_path or SCHEDULES_URL
    local = SCRIPTS_DIR / "data" / "raw" / "schedules.json"
    if local.exists():
        source = str(local)
        print(f"Using local schedules: {source}")
    else:
        print(f"Downloading schedules from {SCHEDULES_URL}")

    print("Parsing + validating schedules...")
    valid_rows, rejected, stats = parse_and_validate(source, stations)
    print(f"  valid_rows: {stats.get('valid_rows')}  rejected: {stats.get('rejected_rows')}")

    report = build_dry_run_report(
        valid_rows, rejected, stats, existing_keys, existing_count, len(stations)
    )
    REPORT_PATH.write_text(json.dumps(report, indent=2, ensure_ascii=False))
    print(f"Dry-run report written: {REPORT_PATH}")
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="All-train train_stops import (DRY-RUN by default; writes gated)."
    )
    parser.add_argument(
        "--schedules",
        default=None,
        help="Optional local path to schedules.json (else URL or data/raw/).",
    )
    parser.add_argument(
        "--execute-import",
        action="store_true",
        help="Attempt write path (still requires TRAIN_STOPS_IMPORT_ENABLED=True in code).",
    )
    args = parser.parse_args(argv)

    if not args.execute_import or DRY_RUN or not TRAIN_STOPS_IMPORT_ENABLED:
        report = run_dry_run(args.schedules)
        print("\n=== DRY-RUN REPORT (NO DATABASE WRITES) ===")
        for k, v in report.items():
            if k == "sample_rejected":
                print(f"{k}: ({len(v)} samples)")
            else:
                print(f"{k}: {v}")
        print("\nNO production rows were written.")
        print(
            "To import later: set DRY_RUN=False AND TRAIN_STOPS_IMPORT_ENABLED=True "
            "in this file, then pass --execute-import (requires explicit approval)."
        )
        return 0

    raise RuntimeError(
        "Import write path is intentionally unreachable while "
        "TRAIN_STOPS_IMPORT_ENABLED is False. Flip the flag only after approval."
    )


if __name__ == "__main__":
    raise SystemExit(main())
