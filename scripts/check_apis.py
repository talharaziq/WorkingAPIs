#!/usr/bin/env python3
"""Low-volume rotating HTTP/CORS probe for the WorkingAPI static catalogue.

This is a reachability check, not a functional test, SLA, security scan, or guarantee
that a provider's free tier/authentication rules have not changed.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "data" / "apis.json"
STATUS_PATH = ROOT / "data" / "status.json"
PROBE_ORIGIN = "https://workingapi.invalid"
USER_AGENT = "WorkingAPI-HealthCheck/1.0"
TIMEOUT_SECONDS = 8
MAX_RESPONSE_BYTES = 32 * 1024


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_json(path: Path, default: dict) -> dict:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        raise RuntimeError(f"Could not read {path.relative_to(ROOT)}: {exc}") from exc


def cors_result(headers, probe_origin: str) -> str:
    allow_origin = headers.get("Access-Control-Allow-Origin") or headers.get("access-control-allow-origin")
    if not allow_origin:
        return "no"
    allow_origin = allow_origin.strip()
    if allow_origin == "*" or allow_origin == probe_origin:
        return "yes"
    # Credentialed CORS cannot use '*'; a provider may echo the requested origin.
    return "restricted"


def check_one(api: dict, probe_origin: str) -> dict:
    url = api.get("check_url")
    checked_at = now_iso()
    result = {
        "status": "not_checked",
        "checked_at": checked_at,
        "http_status": None,
        "cors_probe": "unknown",
        "error": None,
        "content_type": None,
    }
    if not url or not url.startswith("https://"):
        result.update(status="manual_check", error="No safe HTTPS GET check URL is configured.")
        return result

    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/json, application/geo+json, text/plain, */*;q=0.8",
        "Origin": probe_origin,
    }
    # Pass only catalogue headers that do not contain credential placeholders.
    for key, value in (api.get("headers") or {}).items():
        if isinstance(value, str) and "YOUR_" not in value:
            headers[key] = value

    request = Request(url, headers=headers, method="GET")
    try:
        with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            result["http_status"] = response.status
            result["content_type"] = response.headers.get("Content-Type", "")[:100]
            result["cors_probe"] = cors_result(response.headers, probe_origin)
            response.read(MAX_RESPONSE_BYTES)
            if 200 <= response.status < 400:
                result["status"] = "online"
            elif 400 <= response.status < 500:
                result["status"] = "http_error"
            else:
                result["status"] = "server_error"
    except HTTPError as exc:
        result["http_status"] = exc.code
        result["content_type"] = exc.headers.get("Content-Type", "")[:100] if exc.headers else None
        result["cors_probe"] = cors_result(exc.headers or {}, probe_origin)
        try:
            exc.read(2048)
        except Exception:
            pass
        if 400 <= exc.code < 500:
            result["status"] = "http_error"
        else:
            result["status"] = "server_error"
        result["error"] = f"HTTP {exc.code}"
    except (TimeoutError, URLError, OSError) as exc:
        reason = getattr(exc, "reason", exc)
        result["status"] = "offline"
        result["cors_probe"] = "unknown"
        result["error"] = str(reason).replace("\n", " ")[:180]
    except Exception as exc:  # Keep one failed API from failing the whole batch.
        result["status"] = "offline"
        result["error"] = f"{type(exc).__name__}: {str(exc)}"[:180]
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="Check a rotating batch of WorkingAPI endpoints.")
    parser.add_argument("--batch-size", type=int, default=24, help="maximum API endpoints to check per run (default: 24)")
    parser.add_argument("--workers", type=int, default=6, help="maximum concurrent requests (default: 6)")
    parser.add_argument("--all", action="store_true", help="check every eligible endpoint; use sparingly")
    parser.add_argument("--origin", default=PROBE_ORIGIN, help="Origin used for the CORS header probe; set this to the deployed site origin for a site-specific result")
    args = parser.parse_args()
    if args.batch_size < 1 or args.workers < 1:
        parser.error("--batch-size and --workers must be positive")

    catalog = load_json(CATALOG_PATH, {})
    entries = catalog.get("apis", [])
    if not isinstance(entries, list) or len(entries) != catalog.get("count"):
        print("Catalogue shape/count does not match its metadata.", file=sys.stderr)
        return 2

    eligible = [api for api in entries if api.get("check_url")]
    if not eligible:
        print("No endpoints are eligible for automated checking.", file=sys.stderr)
        return 2

    if args.all:
        batch = eligible
    else:
        # Rotate on UTC day; every eligible endpoint will be revisited over successive days.
        batch_count = (len(eligible) + args.batch_size - 1) // args.batch_size
        day_number = datetime.now(timezone.utc).date().toordinal()
        batch_index = day_number % batch_count
        start = batch_index * args.batch_size
        batch = eligible[start:start + args.batch_size]

    default_status = {api["id"]: {
        "status": "not_checked", "checked_at": None, "http_status": None,
        "cors_probe": "not_checked", "error": None, "content_type": None
    } for api in entries}
    status_file = load_json(STATUS_PATH, {"generated_at": None, "probe_origin": args.origin, "results": default_status})
    status_file.setdefault("results", {})
    checked_at = now_iso()
    print(f"Checking {len(batch)} of {len(eligible)} eligible endpoints; concurrency={args.workers}; origin={args.origin}")

    # Use a small worker pool and one request per endpoint. Do not retry or hammer providers.
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {executor.submit(check_one, api, args.origin): api for api in batch}
        for future in concurrent.futures.as_completed(futures):
            api = futures[future]
            try:
                result = future.result()
            except Exception as exc:
                result = {"status": "offline", "checked_at": now_iso(), "http_status": None,
                          "cors_probe": "unknown", "error": str(exc)[:180], "content_type": None}
            status_file["results"][api["id"]] = result
            print(f"{api['name']}: {result['status']} (HTTP {result.get('http_status') or '—'}, CORS probe: {result.get('cors_probe')})")

    status_file["generated_at"] = checked_at
    status_file["probe_origin"] = args.origin
    status_file["checked_this_run"] = len(batch)
    STATUS_PATH.write_text(json.dumps(status_file, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Saved results to {STATUS_PATH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
