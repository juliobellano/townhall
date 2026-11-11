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
const g = globalThis as unknown as { __townDb?: DatabaseSync; __townDbFile?: string };

export function getDb(): DatabaseSync {
  const file = path.join(homeDir(), "townhall.db");
  if (g.__townDb && g.__townDbFile === file) return g.__townDb;
  g.__townDb?.close();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  db.exec(SCHEMA_SQL);
  g.__townDb = db;
  g.__townDbFile = file;
  return db;
}

export function resetDb(): void {
  g.__townDb?.close();
  g.__townDb = undefined;
  g.__townDbFile = undefined;
}

export const now = () => new Date().toISOString();
