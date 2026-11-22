import { app } from 'electron'
import { mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const SCHEMA_VERSION = 1
const MAX_LAUNCH_ROWS = 250
const MAX_EVENT_ROWS = 2000

let connection: DatabaseSync | null = null

export type LaunchStatus = 'starting' | 'running' | 'exited' | 'failed' | 'cancelled'

export interface LaunchStart {
  versionId: string
  instanceDir: string
  startedAt?: string
}

export interface LaunchHistoryEntry {
  id: number
  versionId: string
  accountName: string | null
  accountType: string | null
  instanceDir: string | null
  status: LaunchStatus
  startedAt: string
  finishedAt: string | null
  durationMs: number | null
  exitCode: number | null
  error: string | null
}

export interface DatabaseInfo {
  path: string
  sizeBytes: number
  schemaVersion: number
  accounts: number
  launches: number
  events: number
}

export function databaseFile(): string {
  return join(app.getPath('userData'), 'odissey.db')
}

export function initDatabase(): DatabaseInfo {
  return getDatabaseInfo()
}

export function getDatabase(): DatabaseSync {
  if (connection) return connection

  const file = databaseFile()
  mkdirSync(dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA synchronous = NORMAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')
  migrate(db)
  prune(db)
  connection = db
  return db
}

export function closeDatabase(): void {
  if (!connection) return
  try {
    connection.close()
  } catch {
    connection = null
    return
  }
  connection = null
}

export function getDatabaseInfo(): DatabaseInfo {
  const db = getDatabase()
  const path = databaseFile()
  const version = Number(
    (db.prepare('PRAGMA user_version').get() as { user_version?: number | bigint } | undefined)
      ?.user_version ?? 0
  )
  return {
    path,
    sizeBytes: fileSize(path),
    schemaVersion: version,
    accounts: count(db, 'accounts'),
    launches: count(db, 'launch_history'),
    events: count(db, 'events')
  }
}

export function readSetting<T>(key: string): T | null {
  const row = getDatabase().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value?: string }
    | undefined
  if (!row?.value) return null
  try {
    return JSON.parse(row.value) as T
  } catch {
    return null
  }
}

export function hasSetting(key: string): boolean {
  return Boolean(getDatabase().prepare('SELECT 1 FROM settings WHERE key = ?').get(key))
}

export function writeSetting(key: string, value: unknown): void {
  getDatabase()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(key, JSON.stringify(value), now())
}

export function deleteSetting(key: string): void {
  getDatabase().prepare('DELETE FROM settings WHERE key = ?').run(key)
}

export function recordEvent(type: string, message: string, data?: unknown): void {
  getDatabase()
    .prepare('INSERT INTO events (type, message, data, created_at) VALUES (?, ?, ?, ?)')
    .run(type, message, data === undefined ? null : JSON.stringify(data), now())
}

export function startLaunch(input: LaunchStart): number {
  const startedAt = input.startedAt ?? now()
  const result = getDatabase()
    .prepare(
      `INSERT INTO launch_history
        (version_id, instance_dir, status, started_at)
       VALUES (?, ?, 'starting', ?)`
    )
    .run(input.versionId, input.instanceDir, startedAt)
  const id = Number(result.lastInsertRowid)
  recordEvent('launch.started', `Inicio de ${input.versionId}`, {
    id,
    instanceDir: input.instanceDir,
    startedAt
  })
  return id
}

export function updateLaunch(
  id: number,
  patch: {
    versionId?: string
    accountName?: string
    accountType?: string
    instanceDir?: string
    status?: LaunchStatus
  }
): void {
  getDatabase()
    .prepare(
      `UPDATE launch_history SET
        version_id = COALESCE(?, version_id),
        account_name = COALESCE(?, account_name),
        account_type = COALESCE(?, account_type),
        instance_dir = COALESCE(?, instance_dir),
        status = COALESCE(?, status)
       WHERE id = ?`
    )
    .run(
      patch.versionId ?? null,
      patch.accountName ?? null,
      patch.accountType ?? null,
      patch.instanceDir ?? null,
      patch.status ?? null,
      id
    )
}

export function finishLaunch(
  id: number,
  status: Exclude<LaunchStatus, 'starting' | 'running'>,
  exitCode: number | null,
  error?: unknown
): void {
  const row = getDatabase()
    .prepare('SELECT started_at FROM launch_history WHERE id = ?')
    .get(id) as { started_at?: string } | undefined
  const finishedAt = now()
  const started = row?.started_at ? Date.parse(row.started_at) : Number.NaN
  const duration = Number.isFinite(started) ? Math.max(0, Date.parse(finishedAt) - started) : null
  const detail =
    error === undefined
      ? null
      : error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error)

  getDatabase()
    .prepare(
      `UPDATE launch_history SET
        status = ?, finished_at = ?, duration_ms = ?, exit_code = ?, error = ?
       WHERE id = ?`
    )
    .run(status, finishedAt, duration, exitCode, detail, id)
  recordEvent('launch.finished', `Fin de inicio (${status})`, {
    id,
    status,
    exitCode,
    durationMs: duration,
    error: detail
  })
}

export function listLaunchHistory(limit = 50): LaunchHistoryEntry[] {
  const safeLimit = Math.max(1, Math.min(200, Math.round(limit)))
  const rows = getDatabase()
    .prepare(
      `SELECT id, version_id, account_name, account_type, instance_dir, status,
        started_at, finished_at, duration_ms, exit_code, error
       FROM launch_history ORDER BY id DESC LIMIT ?`
    )
    .all(safeLimit) as Array<Record<string, unknown>>

  return rows.map((row) => ({
    id: Number(row.id),
    versionId: String(row.version_id ?? ''),
    accountName: row.account_name == null ? null : String(row.account_name),
    accountType: row.account_type == null ? null : String(row.account_type),
    instanceDir: row.instance_dir == null ? null : String(row.instance_dir),
    status: String(row.status ?? 'failed') as LaunchStatus,
    startedAt: String(row.started_at ?? ''),
    finishedAt: row.finished_at == null ? null : String(row.finished_at),
    durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
    exitCode: row.exit_code == null ? null : Number(row.exit_code),
    error: row.error == null ? null : String(row.error)
  }))
}

export function clearLaunchHistory(): void {
  getDatabase().exec('DELETE FROM launch_history')
}

function migrate(db: DatabaseSync): void {
  const row = db.prepare('PRAGMA user_version').get() as
    | { user_version?: number | bigint }
    | undefined
  const version = Number(row?.user_version ?? 0)
  if (version >= SCHEMA_VERSION) return

  db.exec('BEGIN IMMEDIATE')
  try {
    if (version < 1) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS accounts (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          name TEXT NOT NULL,
          uuid TEXT NOT NULL,
          added_at TEXT NOT NULL,
          needs_reauth INTEGER NOT NULL DEFAULT 0,
          secrets TEXT,
          position INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS account_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          selected_id TEXT
        );
        INSERT OR IGNORE INTO account_state (id, selected_id) VALUES (1, NULL);

        CREATE TABLE IF NOT EXISTS library_items (
          instance_dir TEXT NOT NULL,
          kind TEXT NOT NULL,
          project_id TEXT NOT NULL,
          payload TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (instance_dir, kind, project_id)
        );

        CREATE TABLE IF NOT EXISTS launch_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          version_id TEXT NOT NULL,
          account_name TEXT,
          account_type TEXT,
          instance_dir TEXT,
          status TEXT NOT NULL,
          started_at TEXT NOT NULL,
          finished_at TEXT,
          duration_ms INTEGER,
          exit_code INTEGER,
          error TEXT
        );
        CREATE INDEX IF NOT EXISTS launch_history_started
          ON launch_history (started_at DESC);

        CREATE TABLE IF NOT EXISTS events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          message TEXT NOT NULL,
          data TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS events_created ON events (created_at DESC);
      `)
      db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

function prune(db: DatabaseSync): void {
  db.prepare(
    `DELETE FROM launch_history WHERE id NOT IN (
      SELECT id FROM launch_history ORDER BY id DESC LIMIT ?
    )`
  ).run(MAX_LAUNCH_ROWS)
  db.prepare(
    `DELETE FROM events WHERE id NOT IN (
      SELECT id FROM events ORDER BY id DESC LIMIT ?
    )`
  ).run(MAX_EVENT_ROWS)
}

function count(db: DatabaseSync, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get() as
    | { total?: number | bigint }
    | undefined
  return Number(row?.total ?? 0)
}

function fileSize(path: string): number {
  try {
    return statSync(path).size
  } catch {
    return 0
  }
}

function now(): string {
  return new Date().toISOString()
}
