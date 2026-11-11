import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "scripts"))
import seed_data  # noqa: E402

EXPECTED = json.load(open(os.path.join(HERE, "expected.json")))


def run(script, inputs, data_dir, args=()):
    proc = subprocess.run(
        [sys.executable, os.path.join(HERE, script), *args],
        input=json.dumps(inputs),
        capture_output=True,
        text=True,
        env={**os.environ, "TOWNHALL_DATA_DIR": data_dir},
    )
    return proc


def oracle(data_dir, month, offset_hours):
    """Independent computation in SQL: shift UTC by a fixed offset, bucket by month."""
    out = {}
    for branch in seed_data.BRANCHES:
        con = sqlite3.connect(os.path.join(data_dir, f"{branch}.db"))
        row = con.execute(
            "SELECT COUNT(*), COALESCE(SUM(amount), 0) FROM transactions "
            "WHERE strftime('%Y-%m', datetime(created_at_utc, ?)) = ?",
            (f"{offset_hours:+d} hours", month),
        ).fetchone()
        con.close()
        out[branch] = {"transactions": row[0], "total": row[1]}
    return out


class BranchReportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.data = cls.tmp.name
        seed_data.build(cls.data)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def result(self, script, inputs):
        proc = run(script, inputs, self.data)
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        return json.loads(proc.stdout)

    def by_branch(self, result):
        return {b["branch"]: {"transactions": b["transactions"], "total": b["total"]} for b in result["branches"]}

    # --- v1 ---
    def test_v1_schema(self):
        proc = run("v1.py", {}, self.data, args=["--schema"])
        schema = json.loads(proc.stdout)
        self.assertEqual(schema["required"], ["month"])
        self.assertNotIn("timezone", schema["properties"])
        self.assertFalse(schema["additionalProperties"])

    def test_v1_buckets_by_utc_month(self):
        res = self.result("v1.py", {"month": "2026-10"})
        self.assertEqual(self.by_branch(res), oracle(self.data, "2026-10", 0))
        for branch in seed_data.BRANCHES:
            self.assertEqual(self.by_branch(res)[branch], EXPECTED["UTC"][branch])
        self.assertEqual(res["grand_total"], EXPECTED["UTC"]["grand_total"])
        self.assertEqual(res["timezone"], "UTC")

    def test_v1_branch_filter(self):
        res = self.result("v1.py", {"month": "2026-10", "branches": ["taipei"]})
        self.assertEqual([b["branch"] for b in res["branches"]], ["taipei"])
        self.assertEqual(res["grand_total"], EXPECTED["UTC"]["taipei"]["total"])

    def test_v1_empty_month_returns_zeros(self):
        res = self.result("v1.py", {"month": "2025-01"})
        self.assertEqual(res["grand_total"], 0)
        self.assertTrue(all(b["transactions"] == 0 for b in res["branches"]))

    def test_v1_invalid_month_is_an_error(self):
        proc = run("v1.py", {"month": "October"}, self.data)
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("month", json.loads(proc.stdout)["error"])

    def test_v1_unknown_branch_is_an_error(self):
        proc = run("v1.py", {"month": "2026-10", "branches": ["paris"]}, self.data)
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("unknown branch", json.loads(proc.stdout)["error"])

    # --- v2 ---
    def test_v2_schema_adds_optional_timezone_with_default(self):
        schema = json.loads(run("v2.py", {}, self.data, args=["--schema"]).stdout)
        self.assertEqual(schema["required"], ["month"])
        self.assertEqual(schema["properties"]["timezone"]["default"], "UTC")

    def test_v2_at_defaults_equals_v1_byte_for_byte(self):
        v1 = run("v1.py", {"month": "2026-10"}, self.data).stdout
        v2 = run("v2.py", {"month": "2026-10"}, self.data).stdout
        self.assertEqual(v1, v2)

    def test_v2_jakarta_moves_the_seeded_oct31_rows_into_november(self):
        res = self.result("v2.py", {"month": "2026-10", "timezone": "Asia/Jakarta"})
        self.assertEqual(self.by_branch(res), oracle(self.data, "2026-10", 7))
        for branch in seed_data.BRANCHES:
            self.assertEqual(self.by_branch(res)[branch], EXPECTED["Asia/Jakarta"][branch])
            # exactly the 3 seeded evening rows moved out of October
            self.assertEqual(EXPECTED["UTC"][branch]["transactions"] - self.by_branch(res)[branch]["transactions"], 3)
        self.assertEqual(res["grand_total"], EXPECTED["Asia/Jakarta"]["grand_total"])
        self.assertEqual(res["timezone"], "Asia/Jakarta")

    def test_v2_invalid_timezone_is_an_error(self):
        proc = run("v2.py", {"month": "2026-10", "timezone": "Mars/Phobos"}, self.data)
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("invalid timezone", json.loads(proc.stdout)["error"])


if __name__ == "__main__":
    unittest.main()
