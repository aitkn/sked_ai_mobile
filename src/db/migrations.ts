import { SQLDatabase } from './database'
import { createTables } from './schema'

export interface Migration {
  version: number
  up: (db: SQLDatabase) => Promise<void>
}

async function ensureMigrationsTable(db: SQLDatabase): Promise<void> {
  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `)
}

async function getCurrentVersion(db: SQLDatabase): Promise<number> {
  const res = await db.executeSql(`SELECT MAX(version) as v FROM migrations;`)
  const rows = res[0].rows
  if (rows.length === 0) return 0
  const row = rows.item(0) as { v?: number | null }
  return (row?.v as number) || 0
}

async function recordMigration(db: SQLDatabase, version: number): Promise<void> {
  await db.executeSql(`INSERT OR REPLACE INTO migrations(version, applied_at) VALUES(?, datetime('now'));`, [version])
}

export const migrations: Migration[] = [
  {
    version: 1,
    up: async (db) => {
      await createTables(db)
    },
  },
  {
    version: 2,
    up: async (db) => {
      // Example migration: add optional new_field
      await db.executeSql(`ALTER TABLE tasks ADD COLUMN new_field TEXT;`).catch(() => Promise.resolve())
    },
  },
  {
    version: 3,
    up: async (db) => {
      // Ensure internal tables exist
      await db.executeSql(`
        CREATE TABLE IF NOT EXISTS internal_tasks (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          start_time TEXT NOT NULL,
          end_time TEXT NOT NULL,
          duration INTEGER DEFAULT 0,
          status TEXT DEFAULT 'pending',
          priority TEXT DEFAULT 'medium',
          completed_at TEXT,
          paused_at TEXT,
          cancelled_at TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
      `)
      await db.executeSql(`CREATE INDEX IF NOT EXISTS idx_internal_tasks_status ON internal_tasks(status);`)
      await db.executeSql(`CREATE INDEX IF NOT EXISTS idx_internal_tasks_start ON internal_tasks(start_time);`)

      await db.executeSql(`
        CREATE TABLE IF NOT EXISTS internal_actions (
          id TEXT PRIMARY KEY,
          action_type TEXT NOT NULL,
          task_id TEXT NOT NULL,
          task_name TEXT NOT NULL,
          timestamp TEXT DEFAULT (datetime('now')),
          details TEXT
        );
      `)
      await db.executeSql(`CREATE INDEX IF NOT EXISTS idx_internal_actions_task ON internal_actions(task_id);`)
      await db.executeSql(`CREATE INDEX IF NOT EXISTS idx_internal_actions_time ON internal_actions(timestamp);`)
    },
  },
]

export async function runMigrations(db: SQLDatabase): Promise<void> {
  await ensureMigrationsTable(db)
  const current = await getCurrentVersion(db)
  const pending = migrations
    .filter((m) => m.version > current)
    .sort((a, b) => a.version - b.version)

  for (const m of pending) {
    await m.up(db)
    await recordMigration(db, m.version)
  }
}


