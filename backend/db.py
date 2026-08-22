import os
from datetime import date as _date
from supabase import create_client, Client
import time
from threading import Lock

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").strip()
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "").strip()

_client: Client | None = None

# Process-local caches (safe: read-only stats, short TTL)
_PNR_STATS_CACHE: dict[tuple[str, str, str], tuple[float, dict | None]] = {}
_PNR_STATS_TTL_SEC = 300.0
_TRAIN_NAMES_CACHE: dict[str, str] | None = None
_STATIC_TRAIN_NAMES: dict[str, str] | None = None
_STOPS_CACHE: dict[str, tuple[float, list]] = {}
_STOPS_TTL_SEC = 600.0
_STATION_NAME_CACHE: dict[str, tuple[float, str]] = {}
_cache_lock = Lock()

_PNR_INDEX: dict[tuple[str, str], dict] | None = None
_PNR_INDEX_LOADED_AT: float = 0.0


STATION_ALIASES: dict[str, list[str]] = {
    "patna": ["pnbe", "patna", "patna junction"],
    "patna junction": ["pnbe", "patna", "patna junction"],
    "paharpur": ["prp", "paharpur"],
    "new delhi": ["ndls", "new delhi", "delhi"],
    "delhi": ["ndls", "new delhi", "delhi"],
    "mumbai": ["mmct", "mumbai", "mumbai central"],
    "mumbai central": ["mmct", "mumbai", "mumbai central"],
    "chennai": ["mas", "chennai", "chennai central"],
    "chennai central": ["mas", "chennai", "chennai central"],
    "howrah": ["hwh", "howrah", "kolkata"],
    "kolkata": ["hwh", "howrah", "kolkata"],
    "bengaluru": ["sbc", "bengaluru", "bangalore"],
    "bangalore": ["sbc", "bengaluru", "bangalore"],
    "danapur": ["dnr", "danapur"],
}


def get_client() -> Client:
    global _client
    if _client is None:
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_KEY must be set as environment variables."
            )
        _client = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _client


def fetch_trains_for_route(
    source: str,
    destination: str,
    journey_date: str | None = None,
) -> list[dict]:
    if not journey_date:
        journey_date = _date.today().isoformat()
    try:
        from irctc_provider import fetch_trains_between
        live = fetch_trains_between(source, destination, journey_date)
        if live:
            return live
    except Exception:
        pass
    client = get_client()
    response = (
        client.table("trains")
        .select("*")
        .eq("source_code", source.upper())
        .eq("destination_code", destination.upper())
        .execute()
    )
    return response.data or []


def fetch_stations(query: str | None = None, limit: int = 50) -> list[dict]:
    """Search stations with ranked matching (exact code/name before contains)."""
    client = get_client()
    q = (query or "").strip()
    if not q:
        response = client.table("stations").select("*").limit(limit).execute()
        return response.data or []

    q_upper = q.upper()
    q_lower = q.lower()
    seen: set[str] = set()
    ranked: list[dict] = []

    def _add(rows: list) -> None:
        for r in rows or []:
            code = str(r.get("code") or "").strip().upper()
            if not code or code in seen:
                continue
            seen.add(code)
            ranked.append(r)

    _add(
        (
            client.table("stations")
            .select("*")
            .eq("code", q_upper)
            .limit(5)
            .execute()
        ).data
    )
    if ranked:
        return ranked[:limit]

    _add(
        (
            client.table("stations")
            .select("*")
            .ilike("name", q)
            .limit(10)
            .execute()
        ).data
    )

    _add(
        (
            client.table("stations")
            .select("*")
            .ilike("city", q)
            .limit(15)
            .execute()
        ).data
    )

    broad = (
        client.table("stations")
        .select("*")
        .or_(f"name.ilike.%{q}%,city.ilike.%{q}%,code.ilike.%{q}%")
        .limit(80)
        .execute()
    ).data or []

    starts, contains = [], []
    for r in broad:
        code = str(r.get("code") or "").strip().upper()
        name = str(r.get("name") or "").strip().lower()
        city = str(r.get("city") or "").strip().lower()
        if code in seen:
            continue
        if name == q_lower or name.startswith(q_lower + " ") or name.startswith(q_lower):
            starts.append(r)
        elif city == q_lower or city.startswith(q_lower):
            starts.append(r)
        elif len(q_lower) >= 4 and (q_lower in name.split() or q_lower == name):
            contains.append(r)
        elif len(q_lower) >= 5 and name.startswith(q_lower[:5]):
            contains.append(r)

    _add(starts)
    _add(contains)
    return ranked[:limit]


def fetch_pnr_history_stats(
    train_number: str,
    class_code: str,
    limit: int = 200,
) -> dict | None:
    client = get_client()
    query = (
        client.table("pnr_history")
        .select("confirmed,verified")
        .eq("train_number", train_number)
        .eq("class_code", class_code)
        .eq("verified", True)
        .limit(limit)
    )
    resp = query.execute()
    rows = resp.data or []
    if not rows:
        return None
    total = len(rows)
    confirmed = sum(1 for row in rows if row.get("confirmed"))
    return {"confirmed": confirmed, "total": total, "confirm_rate": confirmed / total}


_service_client: Client | None = None
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")


def get_service_client() -> Client:
    global _service_client
    if _service_client is None:
        if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set as environment variables."
            )
        _service_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    return _service_client


def fetch_all_train_stop_keys(client, page_size: int = 1000) -> set[tuple[str, str, int]]:
    keys: set[tuple[str, str, int]] = set()
    start = 0
    while True:
        resp = (
            client.table("train_stops")
            .select("train_number,station_code,stop_sequence")
            .range(start, start + page_size - 1)
            .execute()
        )
        rows = resp.data or []
        for r in rows:
            keys.add((r["train_number"], r["station_code"], r["stop_sequence"]))
        if len(rows) < page_size:
            break
        start += page_size
    return keys


def fetch_all_train_stops(client, page_size: int = 1000) -> list:
    all_rows = []
    offset = 0
    while True:
        resp = (
            client.table("train_stops")
            .select("train_number,station_code,stop_sequence,arrival_time,departure_time,day_offset")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        rows = resp.data or []
        all_rows.extend(rows)
        if len(rows) < page_size:
            break
        offset += page_size
    return all_rows


def fetch_train_stops_for_stations(
    client,
    station_codes: list[str] | set[str],
    page_size: int = 1000,
) -> list:
    """Fetch stops for station codes with per-code TTL cache (600s).

    Avoids repeat Supabase pagination for popular stations (PNBE, NDLS, …).
    """
    codes = sorted({str(c).strip().upper() for c in station_codes if c})
    if not codes:
        return []
    all_rows: list = []
    now = time.time()
    missing: list[str] = []
    with _cache_lock:
        for code in codes:
            hit = _STOPS_CACHE.get(code)
            if hit and (now - hit[0]) < _STOPS_TTL_SEC:
                all_rows.extend(hit[1])
            else:
                missing.append(code)
    for code in missing:
        rows_out: list = []
        offset = 0
        while True:
            resp = (
                client.table("train_stops")
                .select(
                    "train_number,station_code,stop_sequence,"
                    "arrival_time,departure_time,day_offset"
                )
                .eq("station_code", code)
                .range(offset, offset + page_size - 1)
                .execute()
            )
            batch = resp.data or []
            rows_out.extend(batch)
            if len(batch) < page_size:
                break
            offset += page_size
        with _cache_lock:
            _STOPS_CACHE[code] = (time.time(), rows_out)
        all_rows.extend(rows_out)
    return all_rows


def _load_static_train_names() -> dict[str, str]:
    """DataMeet train names: local bundle first, then one-time HTTP fetch.

    Source: https://github.com/datameet/railways (trains.json) — same open
    dataset used for stop schedules. Used only to fill gaps when the DB
    trains table lacks a name. Never invents names.
    """
    global _STATIC_TRAIN_NAMES
    if _STATIC_TRAIN_NAMES is not None:
        return _STATIC_TRAIN_NAMES
    names: dict[str, str] = {}
    try:
        from pathlib import Path
        import importlib.util
        import json

        data_dir = Path(__file__).resolve().parent / "data"
        # 1) Local compressed blob if present
        blob = data_dir / "train_names_blob.py"
        if blob.is_file():
            try:
                spec = importlib.util.spec_from_file_location("train_names_blob", blob)
                if spec and spec.loader:
                    mod = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(mod)
                    loaded = getattr(mod, "load_train_names", None)
                    if callable(loaded):
                        candidate = loaded() or {}
                        if isinstance(candidate, dict):
                            for k, v in candidate.items():
                                tn = str(k).strip()
                                nm = str(v or "").strip()
                                if tn and nm:
                                    names[tn] = nm
            except Exception:
                pass
        # 2) Local JSON shards
        for pattern in ("train_names*.json", "tn_*.json"):
            for path in sorted(data_dir.glob(pattern)):
                try:
                    raw = json.loads(path.read_text(encoding="utf-8"))
                except Exception:
                    continue
                if not isinstance(raw, dict):
                    continue
                for k, v in raw.items():
                    tn = str(k).strip()
                    nm = str(v or "").strip()
                    if tn and nm and tn not in names:
                        names[tn] = nm
        # 3) One-time fetch from audited DataMeet source (cached in-process)
        if len(names) < 1000:
            try:
                import urllib.request
                url = (
                    "https://raw.githubusercontent.com/datameet/railways/"
                    "master/trains.json"
                )
                with urllib.request.urlopen(url, timeout=60) as resp:
                    payload = json.loads(resp.read().decode("utf-8"))
                feats = payload.get("features") if isinstance(payload, dict) else []
                for f in feats or []:
                    props = (f or {}).get("properties") or {}
                    tn = str(props.get("number") or props.get("train_number") or "").strip()
                    nm = str(props.get("name") or props.get("train_name") or "").strip()
                    if tn and nm and tn not in names:
                        names[tn] = nm
            except Exception:
                pass
    except Exception:
        names = {}
    _STATIC_TRAIN_NAMES = names
    return names


def fetch_train_names(client) -> dict[str, str]:
    """Train number → name. DB first, then static DataMeet fallback for gaps."""
    global _TRAIN_NAMES_CACHE
    if _TRAIN_NAMES_CACHE is not None:
        return _TRAIN_NAMES_CACHE
    names: dict[str, str] = {}
    offset = 0
    try:
        while True:
            resp = (
                client.table("trains")
                .select("train_number,train_name")
                .range(offset, offset + 999)
                .execute()
            )
            rows = resp.data or []
            for r in rows:
                tn = str(r.get("train_number") or "").strip()
                nm = (r.get("train_name") or "").strip()
                if tn and nm:
                    names[tn] = nm
            if len(rows) < 1000:
                break
            offset += 1000
    except Exception:
        pass
    # Fill gaps from bundled DataMeet names (same open source as stop schedules)
    for tn, nm in _load_static_train_names().items():
        if tn not in names:
            names[tn] = nm
    _TRAIN_NAMES_CACHE = names
    return names


def _load_pnr_index(client) -> dict[tuple[str, str], dict]:
    """Load all verified pnr_history rows once (table is small, ~62 rows)."""
    global _PNR_INDEX, _PNR_INDEX_LOADED_AT
    now = time.time()
    if _PNR_INDEX is not None and (now - _PNR_INDEX_LOADED_AT) < _PNR_STATS_TTL_SEC:
        return _PNR_INDEX
    index: dict[tuple[str, str], dict] = {}
    offset = 0
    while True:
        resp = (
            client.table("pnr_history")
            .select("train_number,class_code,confirmed,quota")
            .eq("verified", True)
            .range(offset, offset + 999)
            .execute()
        )
        rows = resp.data or []
        for r in rows:
            tn = str(r.get("train_number") or "").strip()
            cls = str(r.get("class_code") or "").strip().upper()
            if not tn or not cls:
                continue
            key = (tn, cls)
            bucket = index.setdefault(key, {"confirmed": 0, "total": 0})
            bucket["total"] += 1
            if r.get("confirmed"):
                bucket["confirmed"] += 1
        if len(rows) < 1000:
            break
        offset += 1000
    for key, bucket in index.items():
        total = bucket["total"]
        bucket["confirm_rate"] = (bucket["confirmed"] / total) if total else 0.0
    _PNR_INDEX = index
    _PNR_INDEX_LOADED_AT = now
    return index


def fetch_pnr_stats(
    train_number: str,
    class_code: str,
    quota: str | None = None,
) -> dict | None:
    """Return historical confirmation stats. Uses in-memory index of full pnr_history."""
    client = get_client()
    index = _load_pnr_index(client)
    key = (str(train_number).strip(), str(class_code).strip().upper())
    bucket = index.get(key)
    if not bucket or bucket.get("total", 0) == 0:
        return None
    return {
        "confirmed": bucket["confirmed"],
        "total": bucket["total"],
        "confirm_rate": bucket["confirm_rate"],
    }


def fetch_station_names_for_codes(client, codes: list[str] | set[str]) -> dict[str, str]:
    """Map station_code -> name (TTL-cached per code)."""
    out: dict[str, str] = {}
    uniq = sorted({str(c).strip().upper() for c in codes if c})
    if not uniq:
        return out
    now = time.time()
    missing: list[str] = []
    with _cache_lock:
        for code in uniq:
            hit = _STATION_NAME_CACHE.get(code)
            if hit and (now - hit[0]) < _STOPS_TTL_SEC:
                out[code] = hit[1]
            else:
                missing.append(code)
    if not missing:
        return out
    for i in range(0, len(missing), 50):
        chunk = missing[i : i + 50]
        resp = (
            client.table("stations")
            .select("code,name")
            .in_("code", chunk)
            .execute()
        )
        with _cache_lock:
            for r in resp.data or []:
                code = str(r.get("code") or "").strip().upper()
                name = (r.get("name") or "").strip()
                if code and name:
                    _STATION_NAME_CACHE[code] = (time.time(), name)
                    out[code] = name
    return out
