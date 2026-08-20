"""
All-Train Data Collector (DRY-RUN / local files only).

Downloads the largest openly licensed bulk Indian Railways timetable
dataset from DataMeet (CC0) into local files under scripts/data/raw/.

PRIMARY SOURCE (recommended for bulk offline collection):
  https://github.com/datameet/railways
  - trains.json     (~14 MB)  train-level metadata
  - schedules.json  (~78 MB)  stop-level schedule rows
  - stations.json   (~1.8 MB) station reference

WHY NOT LIVE NTES SCRAPING FOR THIS PASS:
  - NTES / enquiry.indianrail.gov.in is oriented to per-train or
    per-OD queries, not a full bulk dump.
  - Unofficial bulk scraping is rate-limited, fragile, and may violate
    terms of use; we do not invent or hit undocumented endpoints.
  - DataMeet already published a full stop-level dump suitable for
    dry-run validation against our station catalogue.

NO Supabase writes. NO modification of production data.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

import httpx

# ---------------------------------------------------------------------------
# Source URLs (verified GitHub raw links for datameet/railways)
# ---------------------------------------------------------------------------
TRAINS_URL = (
    "https://raw.githubusercontent.com/datameet/railways/master/trains.json"
)
SCHEDULES_URL = (
    "https://raw.githubusercontent.com/datameet/railways/master/schedules.json"
)
STATIONS_URL = (
    "https://raw.githubusercontent.com/datameet/railways/master/stations.json"
)

DEFAULT_OUT_DIR = Path(__file__).resolve().parent / "data" / "raw"


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def download(url: str, dest: Path, timeout: float = 300.0) -> dict:
    """Stream download to dest. Returns metadata dict."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"Downloading {url}")
    print(f"  -> {dest}")
    t0 = time.time()
    with httpx.stream("GET", url, timeout=timeout, follow_redirects=True) as resp:
        resp.raise_for_status()
        total = 0
        with dest.open("wb") as out:
            for chunk in resp.iter_bytes(chunk_size=1024 * 256):
                out.write(chunk)
                total += len(chunk)
                if total % (5 * 1024 * 1024) < 1024 * 256:
                    print(f"  ... {total / (1024 * 1024):.1f} MB")
    elapsed = time.time() - t0
    digest = _sha256(dest)
    meta = {
        "url": url,
        "path": str(dest),
        "bytes": total,
        "sha256": digest,
        "elapsed_seconds": round(elapsed, 2),
    }
    print(f"  done: {total} bytes in {elapsed:.1f}s  sha256={digest[:16]}...")
    return meta


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Collect all-train timetable raw files (local only, no DB writes)."
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=DEFAULT_OUT_DIR,
        help=f"Directory for raw files (default: {DEFAULT_OUT_DIR})",
    )
    parser.add_argument(
        "--skip-schedules",
        action="store_true",
        help="Skip the large schedules.json download (debug only).",
    )
    args = parser.parse_args(argv)

    out_dir: Path = args.out_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    manifest = {
        "collector": "collect_all_trains.py",
        "source_project": "https://github.com/datameet/railways",
        "license_note": "DataMeet railways dataset is published for open reuse (CC0 per project docs).",
        "database_writes_performed": False,
        "files": {},
    }

    targets = [
        ("stations.json", STATIONS_URL),
        ("trains.json", TRAINS_URL),
    ]
    if not args.skip_schedules:
        targets.append(("schedules.json", SCHEDULES_URL))

    for name, url in targets:
        dest = out_dir / name
        try:
            meta = download(url, dest)
            manifest["files"][name] = meta
        except Exception as exc:
            print(f"ERROR downloading {name}: {exc}", file=sys.stderr)
            manifest["files"][name] = {"url": url, "error": str(exc)}
            return 1

    manifest_path = out_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))
    print(f"\nManifest written: {manifest_path}")
    print("COLLECTION COMPLETE. No Supabase writes were performed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
