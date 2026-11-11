#!/usr/bin/env python3
"""Build the mock company data: three branch SQLite databases.

Deterministic (no randomness) so expected totals can be recorded and tested.
All timestamps are stored in UTC. The "trap": every branch has three
transactions on Oct 31 between 17:00 and 23:59 UTC. A report that buckets by
UTC puts them in October; a report with an Asia/Jakarta (UTC+7) month cutoff
puts them in November.
"""
import os
import sqlite3
import sys

BRANCHES = ["jakarta", "taipei", "london"]


def _rows_for(branch_index: int):
    rows = []

    def add(month: int, day: int, k: int):
        hour = 1 + ((day * 5 + k * 3 + branch_index) % 15)  # 01..15 UTC, never near a cutoff
        minute = (day * 11 + k * 17) % 60
        amount = 1000 + ((day * 131 + k * 57 + branch_index * 211) % 900) * 10
        rows.append((f"2026-{month:02d}-{day:02d}T{hour:02d}:{minute:02d}:00Z", amount))

    for day in range(25, 30):  # late September
        for k in range(2):
            add(9, day, k)
    for day in range(1, 32):  # October
        for k in range(2 + ((day * 7 + branch_index * 3) % 3)):
            add(10, day, k)
    for day in range(1, 4):  # early November
        for k in range(2):
            add(11, day, k)

    # The trap: Oct 31 evening UTC.
    rows.append(("2026-10-31T17:30:00Z", 12000 + branch_index * 500))
    rows.append(("2026-10-31T20:15:00Z", 8000 + branch_index * 300))
    rows.append(("2026-10-31T23:10:00Z", 5000 + branch_index * 100))
    rows.sort()
    return rows


def build(data_dir: str) -> None:
    os.makedirs(data_dir, exist_ok=True)
    for i, branch in enumerate(BRANCHES):
        path = os.path.join(data_dir, f"{branch}.db")
        if os.path.exists(path):
            os.remove(path)
        con = sqlite3.connect(path)
        con.execute(
            "CREATE TABLE transactions (id INTEGER PRIMARY KEY, branch TEXT NOT NULL, "
            "amount INTEGER NOT NULL, created_at_utc TEXT NOT NULL)"
        )
        con.executemany(
            "INSERT INTO transactions (branch, amount, created_at_utc) VALUES (?, ?, ?)",
            [(branch, amount, ts) for ts, amount in _rows_for(i)],
        )
        con.commit()
        con.close()


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "data", "company")
    build(os.path.abspath(target))
    print(f"seeded {len(BRANCHES)} branch databases in {os.path.abspath(target)}")
