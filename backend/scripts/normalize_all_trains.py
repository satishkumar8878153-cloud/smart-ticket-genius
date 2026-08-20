"""
All-Train Data Normalizer + Validator (DRY-RUN / local files only).

Reads raw DataMeet dumps produced by collect_all_trains.py and writes:

  data/normalized/trains.jsonl
  data/normalized/train_stops.jsonl
  data/normalized/errors_by_category.json   (samples only)
  scripts/all_trains_report.json            (summary for git)

Validation checks (no fabrication, no auto-merge of conflicts):
  - invalid / empty train numbers
  - duplicate trains (same number, conflicting identity fields)
  - duplicate stops (train_number, station_code, stop_sequence)
  - unknown station codes (vs Supabase stations if configured, else
    DataMeet stations.json)
  - missing train names / source / destination
  - invalid stop sequences
  - malformed times
  - incomplete schedules (< 2 stops)
  - conflicting train records

NO Supabase INSERT/UPDATE/DELETE/UPSERT.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

try:
    import ijson.backends.python as ijson
except ImportError:
    ijson = None  # type: ignore

SCRIPTS_DIR = Path(__file__).resolve().parent
DEFAULT_RAW = SCRIPTS_DIR / "data" / "raw"
DEFAULT_NORM = SCRIPTS_DIR / "data" / "normalized"
REPORT_PATH = SCRIPTS_DIR / "all_trains_report.json"

TIME_RE = re.compile(r"^([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d)?$")
NONE_TIMES = {None, "", "None", "none", "NULL", "null", "-"}


def _norm_time(value: Any) -> str | None:
    if value in NONE_TIMES:
        return None
    s = str(value).strip()
    if s in NONE_TIMES:
        return None
    if TIME_RE.match(s):
        parts = s.split(":")
        if len(parts) == 2:
            return f"{int(parts[0]):02d}:{parts[1]}"
        return f"{int(parts[0]):02d}:{parts[1]}:{parts[2]}"
    return None


def _norm_train_number(value: Any) -> str:
    return str(value or "").strip()


def load_station_codes_from_datameet(stations_path: Path) -> set[str]:
    codes: set[str] = set()
    with stations_path.open("rb") as f:
        if ijson is not None:
            for feature in ijson.items(f, "features.item"):
                props = feature.get("properties") or {}
                code = str(props.get("code") or "").strip().upper()
                if code:
                    codes.add(code)
        else:
            data = json.load(f)
            for feature in data.get("features") or []:
                props = feature.get("properties") or {}
                code = str(props.get("code") or "").strip().upper()
                if code:
                    codes.add(code)
    return codes


def load_station_codes_from_supabase() -> set[str] | None:
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_KEY", "").strip()
    if not url or not key:
        return None
    try:
        from supabase import create_client

        client = create_client(url, key)
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
    except Exception as exc:
        print(f"WARNING: could not load stations from Supabase: {exc}", file=sys.stderr)
        return None


def parse_trains_geojson(path: Path) -> tuple[list[dict], list[dict]]:
    trains: list[dict] = []
    errors: list[dict] = []
    with path.open("rb") as f:
        if ijson is not None:
            features = ijson.items(f, "features.item")
        else:
            features = json.load(f).get("features") or []

        for feat in features:
            props = (feat.get("properties") if isinstance(feat, dict) else None) or {}
            number = _norm_train_number(props.get("number"))
            if not number:
                errors.append({"category": "invalid_train_numbers", "row": props})
                continue
            trains.append(
                {
                    "train_number": number,
                    "train_name": (str(props.get("name") or "").strip() or None),
                    "source_code": (
                        str(props.get("from_station_code") or "").strip().upper() or None
                    ),
                    "destination_code": (
                        str(props.get("to_station_code") or "").strip().upper() or None
                    ),
                    "running_days": props.get("running_days") or props.get("classes") or None,
                    "distance": props.get("distance"),
                    "type": props.get("type"),
                    "zone": props.get("zone"),
                    "departure": _norm_time(props.get("departure")),
                    "arrival": _norm_time(props.get("arrival")),
                    "duration_h": props.get("duration_h"),
                    "duration_m": props.get("duration_m"),
                    "return_train": props.get("return_train"),
                }
            )
    return trains, errors


def stream_schedules(path: Path):
    with path.open("rb") as f:
        if ijson is not None:
            yield from ijson.items(f, "item")
        else:
            data = json.load(f)
            yield from data


def normalize_and_validate(
    raw_dir: Path,
    norm_dir: Path,
    station_codes: set[str],
    station_source: str,
) -> dict:
    norm_dir.mkdir(parents=True, exist_ok=True)

    report: dict[str, Any] = {
        "dry_run": True,
        "database_writes_performed": False,
        "source": {
            "project": "https://github.com/datameet/railways",
            "trains_url": "https://raw.githubusercontent.com/datameet/railways/master/trains.json",
            "schedules_url": "https://raw.githubusercontent.com/datameet/railways/master/schedules.json",
            "stations_url": "https://raw.githubusercontent.com/datameet/railways/master/stations.json",
        },
        "station_reference": {
            "source": station_source,
            "count": len(station_codes),
        },
        "totals": {},
        "validation": {},
        "sample_errors": {},
    }

    samples: dict[str, list] = defaultdict(list)
    counts: dict[str, int] = defaultdict(int)

    def note_error(category: str, payload: dict, limit: int = 20) -> None:
        counts[category] += 1
        if len(samples[category]) < limit:
            samples[category].append(payload)

    trains_path = raw_dir / "trains.json"
    if not trains_path.exists():
        raise FileNotFoundError(f"Missing {trains_path}; run collect_all_trains.py first")

    print(f"Parsing trains from {trains_path} ...")
    trains_raw, train_parse_errors = parse_trains_geojson(trains_path)
    for e in train_parse_errors:
        note_error(e["category"], e)

    by_number: dict[str, list[dict]] = defaultdict(list)
    for t in trains_raw:
        by_number[t["train_number"]].append(t)

    valid_trains: list[dict] = []
    for number, group in by_number.items():
        if len(group) > 1:
            keys = {
                (
                    g.get("train_name"),
                    g.get("source_code"),
                    g.get("destination_code"),
                    g.get("distance"),
                )
                for g in group
            }
            if len(keys) > 1:
                note_error(
                    "conflicting_train_records",
                    {"train_number": number, "variants": group[:5]},
                )
                counts["duplicate_trains"] += len(group) - 1
            else:
                counts["duplicate_trains"] += len(group) - 1
        chosen = group[0]
        if not chosen.get("train_name"):
            note_error("missing_train_names", {"train_number": number})
        if not chosen.get("source_code"):
            note_error("missing_source", {"train_number": number})
        if not chosen.get("destination_code"):
            note_error("missing_destination", {"train_number": number})
        if chosen.get("source_code") and chosen["source_code"] not in station_codes:
            note_error(
                "unknown_station_codes",
                {"train_number": number, "field": "source_code", "code": chosen["source_code"]},
            )
        if chosen.get("destination_code") and chosen["destination_code"] not in station_codes:
            note_error(
                "unknown_station_codes",
                {
                    "train_number": number,
                    "field": "destination_code",
                    "code": chosen["destination_code"],
                },
            )
        valid_trains.append(chosen)

    counts["trains_discovered"] = len(by_number)
    counts["trains_records_raw"] = len(trains_raw)
    counts["valid_trains"] = len(valid_trains)

    trains_out = norm_dir / "trains.jsonl"
    with trains_out.open("w", encoding="utf-8") as f:
        for t in valid_trains:
            f.write(json.dumps(t, ensure_ascii=False) + "\n")
    print(f"Wrote {len(valid_trains)} trains -> {trains_out}")

    schedules_path = raw_dir / "schedules.json"
    if not schedules_path.exists():
        raise FileNotFoundError(f"Missing {schedules_path}; run collect_all_trains.py first")

    print(f"Streaming schedules from {schedules_path} ...")
    grouped: dict[str, list[dict]] = defaultdict(list)
    seen_keys: set[tuple] = set()

    for row in stream_schedules(schedules_path):
        counts["total_schedule_rows_scanned"] += 1
        if counts["total_schedule_rows_scanned"] % 100000 == 0:
            print(f"  ... scanned {counts['total_schedule_rows_scanned']} rows")

        train_number = _norm_train_number(row.get("train_number"))
        if not train_number:
            note_error("invalid_train_numbers", {"row": _clip_row(row)})
            continue

        station_code = str(row.get("station_code") or "").strip().upper()
        if not station_code:
            note_error("unknown_station_codes", {"reason": "empty", "train_number": train_number})
            continue
        if station_code not in station_codes:
            note_error(
                "unknown_station_codes",
                {"train_number": train_number, "code": station_code},
            )
            continue

        arrival = _norm_time(row.get("arrival"))
        departure = _norm_time(row.get("departure"))
        raw_arr = row.get("arrival")
        raw_dep = row.get("departure")
        if raw_arr not in NONE_TIMES and arrival is None:
            note_error(
                "malformed_times",
                {"train_number": train_number, "field": "arrival", "value": raw_arr},
            )
        if raw_dep not in NONE_TIMES and departure is None:
            note_error(
                "malformed_times",
                {"train_number": train_number, "field": "departure", "value": raw_dep},
            )

        day_raw = row.get("day", 1)
        if day_raw in (None, "", "None", "null"):
            day_offset = 1
        else:
            try:
                day_offset = int(day_raw)
            except (TypeError, ValueError):
                day_offset = 1
                note_error(
                    "invalid_day_offset",
                    {"train_number": train_number, "reason": "bad day", "value": day_raw},
                )

        provisional_seq = len(grouped[train_number]) + 1
        key = (train_number, station_code, provisional_seq)
        if key in seen_keys:
            note_error(
                "duplicate_stops",
                {
                    "train_number": train_number,
                    "station_code": station_code,
                    "stop_sequence": provisional_seq,
                },
            )
            continue
        seen_keys.add(key)

        grouped[train_number].append(
            {
                "train_number": train_number,
                "station_code": station_code,
                "stop_sequence": provisional_seq,
                "arrival_time": arrival,
                "departure_time": departure,
                "day_offset": day_offset,
                "halt_time": None,
                "station_name": row.get("station_name"),
            }
        )

    valid_stops: list[dict] = []
    trains_with_stops = 0
    incomplete = 0
    for train_number, stops in grouped.items():
        stops_sorted = sorted(
            stops,
            key=lambda s: (
                s.get("day_offset") or 0,
                s.get("departure_time") or s.get("arrival_time") or "99:99",
            ),
        )
        cleaned: list[dict] = []
        for i, s in enumerate(stops_sorted, start=1):
            s = dict(s)
            s["stop_sequence"] = i
            cleaned.append(s)

        if len(cleaned) < 2:
            incomplete += 1
            note_error(
                "incomplete_schedules",
                {"train_number": train_number, "stop_count": len(cleaned)},
            )
        else:
            trains_with_stops += 1
        valid_stops.extend(cleaned)

    counts["total_stop_records_emitted"] = len(valid_stops)
    counts["trains_with_schedule"] = trains_with_stops
    counts["incomplete_schedules"] = incomplete
    counts["unique_trains_in_schedules"] = len(grouped)

    stops_out = norm_dir / "train_stops.jsonl"
    with stops_out.open("w", encoding="utf-8") as f:
        for s in valid_stops:
            f.write(json.dumps(s, ensure_ascii=False) + "\n")
    print(f"Wrote {len(valid_stops)} stops -> {stops_out}")

    errors_out = norm_dir / "errors_by_category.json"
    errors_out.write_text(
        json.dumps({k: v for k, v in samples.items()}, indent=2, ensure_ascii=False)
    )
    print(f"Wrote error samples -> {errors_out}")

    report["totals"] = {
        "trains_discovered": counts["trains_discovered"],
        "trains_records_raw": counts["trains_records_raw"],
        "valid_trains": counts["valid_trains"],
        "unique_trains_in_schedules": counts["unique_trains_in_schedules"],
        "trains_with_complete_schedule": trains_with_stops,
        "total_schedule_rows_scanned": counts["total_schedule_rows_scanned"],
        "total_stop_records_emitted": counts["total_stop_records_emitted"],
    }
    report["validation"] = {
        "invalid_train_numbers": counts.get("invalid_train_numbers", 0),
        "duplicate_trains": counts.get("duplicate_trains", 0),
        "duplicate_stops": counts.get("duplicate_stops", 0),
        "unknown_station_codes": counts.get("unknown_station_codes", 0),
        "missing_train_names": counts.get("missing_train_names", 0),
        "missing_source": counts.get("missing_source", 0),
        "missing_destination": counts.get("missing_destination", 0),
        "invalid_stop_sequence": counts.get("invalid_stop_sequence", 0),
        "malformed_times": counts.get("malformed_times", 0),
        "conflicting_train_records": counts.get("conflicting_train_records", 0),
        "incomplete_schedules": counts.get("incomplete_schedules", 0),
    }
    report["sample_errors"] = {k: v for k, v in samples.items()}
    report["outputs"] = {
        "trains_jsonl": str(trains_out),
        "train_stops_jsonl": str(stops_out),
        "errors_by_category": str(errors_out),
    }

    REPORT_PATH.write_text(json.dumps(report, indent=2, ensure_ascii=False))
    print(f"Report written -> {REPORT_PATH}")
    return report


def _clip_row(row: dict) -> dict:
    out = {}
    for k, v in list(row.items())[:12]:
        out[k] = v
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Normalize + validate all-train data (local files only, no DB writes)."
    )
    parser.add_argument("--raw-dir", type=Path, default=DEFAULT_RAW)
    parser.add_argument("--norm-dir", type=Path, default=DEFAULT_NORM)
    args = parser.parse_args(argv)

    sb_codes = load_station_codes_from_supabase()
    if sb_codes is not None and len(sb_codes) > 0:
        station_codes = sb_codes
        station_source = "supabase.public.stations (read-only)"
        print(f"Loaded {len(station_codes)} station codes from Supabase")
    else:
        stations_path = args.raw_dir / "stations.json"
        if not stations_path.exists():
            print(
                "ERROR: No Supabase credentials and missing data/raw/stations.json",
                file=sys.stderr,
            )
            return 1
        station_codes = load_station_codes_from_datameet(stations_path)
        station_source = "datameet/railways stations.json (fallback)"
        print(f"Loaded {len(station_codes)} station codes from DataMeet stations.json")

    report = normalize_and_validate(
        args.raw_dir, args.norm_dir, station_codes, station_source
    )

    print("\n=== DRY-RUN SUMMARY (no database writes) ===")
    print(json.dumps(report["totals"], indent=2))
    print("validation:")
    print(json.dumps(report["validation"], indent=2))
    print("NORMALIZE COMPLETE. No Supabase writes were performed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
