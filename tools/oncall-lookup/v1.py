#!/usr/bin/env python3
"""On-call lookup (v1). Mock data for the access-control demo: an engineering-only tool.

Town Hall tool contract:
  python v1.py --schema   -> prints this tool's input JSON Schema
  python v1.py            -> reads JSON inputs on stdin, writes a JSON result on stdout
Failures print {"error": "..."} on stdout and exit with a non-zero status.
"""
import json
import sys

ROTA = {
    "payments": {"on_call": "sarah", "backup": "dimas", "runbook": "runbooks/payments.md", "escalation": "#eng-payments"},
    "search": {"on_call": "kevin", "backup": "sarah", "runbook": "runbooks/search.md", "escalation": "#eng-search"},
    "auth": {"on_call": "dimas", "backup": "kevin", "runbook": "runbooks/auth.md", "escalation": "#eng-security"},
}

SCHEMA = {
    "type": "object",
    "properties": {
        "service": {"type": "string", "enum": sorted(ROTA), "description": "Service name"},
    },
    "required": ["service"],
    "additionalProperties": False,
}


def main() -> int:
    if "--schema" in sys.argv:
        print(json.dumps(SCHEMA))
        return 0
    try:
        inputs = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError:
        print(json.dumps({"error": "inputs must be a JSON object"}))
        return 1
    service = inputs.get("service")
    if service not in ROTA:
        print(json.dumps({"error": f"unknown service: {service}. Services: {', '.join(sorted(ROTA))}"}))
        return 1
    print(json.dumps({"service": service, **ROTA[service]}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
