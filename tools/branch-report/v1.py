#!/usr/bin/env python3
"""Branch finance report (v1).

Town Hall tool contract:
  python v1.py --schema   -> prints this tool's input JSON Schema
  python v1.py            -> reads JSON inputs on stdin, writes a JSON result on stdout
Failures print {"error": "..."} on stdout and exit with a non-zero status.
Reads branch databases (*.db) from $TOWNHALL_DATA_DIR. Buckets by UTC month.
"""
import glob
import json
import os
import re
import sqlite3
import sys
from datetime import datetime

SCHEMA = {
    "type": "object",
    "properties": {
        "month": {"type": "string", "pattern": r"^\d{4}-\d{2}$", "description": "Report month, YYYY-MM"},
        "branches": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Branch names to include. Defaults to all branches.",
        },
    },
    "required": ["month"],
    "additionalProperties": False,
}


def fail(message: str):
    print(json.dumps({"error": message}))
    sys.exit(2)


def main():
    if "--schema" in sys.argv:
        print(json.dumps(SCHEMA, sort_keys=True))
        return
    try:
        inputs = json.load(sys.stdin)
    except json.JSONDecodeError:
        fail("inputs must be valid JSON")
    month = inputs.get("month")
    if not isinstance(month, str) or not re.match(r"^\d{4}-\d{2}$", month):
        fail("month must be a string like 2026-10")
    wanted = inputs.get("branches")
    data_dir = os.environ.get("TOWNHALL_DATA_DIR")
    if not data_dir:
        fail("TOWNHALL_DATA_DIR is not set")
    paths = sorted(glob.glob(os.path.join(data_dir, "*.db")))
    available = [os.path.splitext(os.path.basename(p))[0] for p in paths]
    if wanted:
        unknown = [b for b in wanted if b not in available]
        if unknown:
            fail(f"unknown branch: {', '.join(unknown)}")
    result = []
    for path, name in zip(paths, available):
        if wanted and name not in wanted:
            continue
        con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        count, total = 0, 0
        for ts, amount in con.execute("SELECT created_at_utc, amount FROM transactions"):
            when = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            if when.strftime("%Y-%m") == month:
                count += 1
                total += amount
        con.close()
        result.append({"branch": name, "transactions": count, "total": total})
    print(json.dumps(
        {"month": month, "timezone": "UTC", "branches": result, "grand_total": sum(r["total"] for r in result)},
        sort_keys=True,
    ))


if __name__ == "__main__":
    main()
