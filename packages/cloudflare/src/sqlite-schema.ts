import type { DurableObjectStorageLike } from "./bindings.js";

export const SUPEROBJECTIVE_SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  island_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  source_tsx TEXT NOT NULL,
  compiled_client_js TEXT,
  compiled_server_js TEXT,
  compiled_css TEXT,
  integrity TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS active_artifacts (
  island_id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS view_state (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS render_cache (
  cache_key TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL,
  state_hash TEXT NOT NULL,
  html TEXT,
  boot_json TEXT NOT NULL,
  etag TEXT NOT NULL,
  fresh_until INTEGER NOT NULL,
  stale_until INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tool_calls (
  id TEXT PRIMARY KEY,
  tool_name TEXT NOT NULL,
  input_json TEXT NOT NULL,
  output_json TEXT,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

export function ensureSqliteSchema(storage: DurableObjectStorageLike): void {
  if (!storage.sql) {
    return;
  }

  for (const statement of SUPEROBJECTIVE_SQLITE_SCHEMA.split(";")) {
    const trimmed = statement.trim();

    if (trimmed) {
      storage.sql.exec(`${trimmed};`);
    }
  }
}
