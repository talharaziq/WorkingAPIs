#!/usr/bin/env python3
"""Validate WorkingAPI catalog completeness and internal links before publishing."""
import json
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / 'data' / 'apis.json'
STATUS = ROOT / 'data' / 'status.json'
REQUIRED = ['id','name','category','description','endpoint','docs','auth','https','cors','rate_limit','free_tier','example_js']

def valid_http_url(value):
    try:
        parsed = urlparse(value)
        return parsed.scheme in ('http','https') and bool(parsed.netloc)
    except Exception:
        return False

def main():
    data = json.loads(CATALOG.read_text(encoding='utf-8'))
    rows = data.get('apis')
    errors = []
    if not isinstance(rows, list): errors.append('apis must be a list')
    elif len(rows) != 150: errors.append(f'expected 150 entries, found {len(rows)}')
    ids = [a.get('id') for a in rows]
    if len(ids) != len(set(ids)): errors.append('duplicate API ids found')
    for index, api in enumerate(rows or [], 1):
        missing = [field for field in REQUIRED if field not in api or api[field] is None or api[field] == '']
        if missing: errors.append(f'#{index} {api.get("name", "(unnamed)")}: missing {", ".join(missing)}')
        if not valid_http_url(api.get('endpoint','')): errors.append(f'#{index} {api.get("name")}: invalid endpoint URL')
        if not valid_http_url(api.get('docs','')): errors.append(f'#{index} {api.get("name")}: invalid docs URL')
        if api.get('https') is not str(api.get('endpoint','')).startswith('https://'):
            errors.append(f'#{index} {api.get("name")}: https field does not match endpoint')
        if api.get('cors') not in ('Yes','No','Unknown','N/A — self-hosted','N/A — bulk TSV downloads','N/A — static resource catalogue','N/A — local library'):
            errors.append(f'#{index} {api.get("name")}: unrecognised cors value {api.get("cors")}')
        if not isinstance(api.get('example_js'), str) or 'fetch(' not in api['example_js'] and 'document.createElement("img")' not in api['example_js']:
            errors.append(f'#{index} {api.get("name")}: missing recognizable JavaScript example')
    status_data = json.loads(STATUS.read_text(encoding='utf-8')) if STATUS.exists() else {}
    result_ids = set(status_data.get('results', {}))
    if rows and result_ids != set(ids): errors.append('status.json API IDs do not match apis.json')
    if errors:
        print('Catalog validation FAILED:')
        for err in errors: print(' -',err)
        return 1
    print(f'Catalog validation passed: {len(rows)} entries, {len(data.get("categories", []))} categories, all required fields present.')
    print(f'Eligible for automated checks: {sum(bool(a.get("check_url")) for a in rows)}')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
