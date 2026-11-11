import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { homeDir } from "./paths";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS tools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  owner TEXT NOT NULL,
  touches TEXT NOT NULL DEFAULT '[]',
  access TEXT NOT NULL DEFAULT '[]',
  checks TEXT NOT NULL DEFAULT '{}',
  latest_version INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS versions (
  tool_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  source TEXT NOT NULL,
  schema_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (tool_id, version)
);
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tool_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  person TEXT NOT NULL,
  agent TEXT NOT NULL,
  inputs TEXT NOT NULL,
  ok INTEGER NOT NULL,
  output TEXT,
  error TEXT,
  files TEXT NOT NULL DEFAULT '[]',
  duration_ms INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS changes (
  id TEXT PRIMARY KEY,
  tool_id TEXT NOT NULL,
  requester_user TEXT NOT NULL,
  requester_agent TEXT NOT NULL,
  need TEXT NOT NULL,
  status TEXT NOT NULL,
  decision TEXT,
  reason TEXT,
  from_version INTEGER NOT NULL,
  to_version INTEGER,
  new_source TEXT,
  diff TEXT,
  gate_json TEXT,
  backend TEXT,
  cached INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

// One connection per process, kept on globalThis so dev hot reloads do not open several.
const g = globalThis as unknown as { __townDb?: DatabaseSync; __townDbFile?: string; __townDbIno?: number };

const inodeOf = (file: string): number | null => {
  try {
    return fs.statSync(file).ino;
  } catch {
    return null;
  }
};

export function getDb(): DatabaseSync {
  const file = path.join(homeDir(), "townhall.db");
  // Reuse the open connection only while it is still the file on disk. If the database was
  // deleted or replaced (for example by wiping data/), reopen instead of reading a ghost.
  if (g.__townDb && g.__townDbFile === file && g.__townDbIno === inodeOf(file)) return g.__townDb;
  try {
    g.__townDb?.close();
  } catch {}
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  db.exec(SCHEMA_SQL);
  // Databases created before access control have no access column. Existing tools stay open to everyone.
  const toolCols = db.prepare("PRAGMA table_info(tools)").all() as { name: string }[];
  if (!toolCols.some((c) => c.name === "access")) db.exec("ALTER TABLE tools ADD COLUMN access TEXT NOT NULL DEFAULT '[]'");
  const runCols = db.prepare("PRAGMA table_info(runs)").all() as { name: string }[];
  if (!runCols.some((c) => c.name === "files")) db.exec("ALTER TABLE runs ADD COLUMN files TEXT NOT NULL DEFAULT '[]'");
  g.__townDb = db;
  g.__townDbFile = file;
  g.__townDbIno = inodeOf(file) ?? undefined;
  return db;
}

export function resetDb(): void {
  try {
    g.__townDb?.close();
  } catch {}
  g.__townDb = undefined;
  g.__townDbFile = undefined;
  g.__townDbIno = undefined;
}

export const now = () => new Date().toISOString();
