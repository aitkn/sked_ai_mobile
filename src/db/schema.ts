import { SQLDatabase } from './database'

export async function createTables(db: SQLDatabase): Promise<void> {
  // tasks
  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS tasks (
      task_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      task_type TEXT,
      is_top INTEGER DEFAULT 0,
      task_group_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `)
  await db.executeSql(`CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);`)
  await db.executeSql(`CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(task_type);`)

  // entities
  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS entities (
      entity_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      is_person INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `)
  await db.executeSql(`CREATE INDEX IF NOT EXISTS idx_entities_user ON entities(user_id);`)

  // internal tasks (for mobile schedule)
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

  // internal actions
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
}


