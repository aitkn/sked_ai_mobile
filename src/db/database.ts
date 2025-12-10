import SQLite from 'react-native-sqlite-storage'
import { runMigrations } from './migrations'

SQLite.enablePromise?.(true)

export type SQLResultRow = Record<string, unknown>

export interface SQLRows {
  length: number
  item: (index: number) => SQLResultRow
}

export interface SQLResult {
  rows: SQLRows
  rowsAffected?: number
  insertId?: number
}

export interface SQLDatabase {
  executeSql: (sql: string, params?: unknown[]) => Promise<SQLResult[]>
  transaction<T>(fn: (tx: { executeSql: SQLDatabase['executeSql'] }) => Promise<T>): Promise<T>
  close?: () => Promise<void>
}

class SQLiteDatabaseAdapter implements SQLDatabase {
  private db: any

  constructor(db: any) {
    this.db = db
  }

  async executeSql(sql: string, params: unknown[] = []): Promise<SQLResult[]> {
    const results = await this.db.executeSql(sql, params)
    // react-native-sqlite-storage returns an array of result sets
    return results as SQLResult[]
  }

  async transaction<T>(fn: (tx: { executeSql: SQLDatabase['executeSql'] }) => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.db
        .transaction(
          async (tx: any) => {
            const exec = (sql: string, params: unknown[] = []) => tx.executeSql(sql, params)
            try {
              const res = await fn({ executeSql: exec as any })
              resolve(res)
            } catch (err) {
              reject(err)
            }
          },
          (err: any) => reject(err)
        )
        .catch((err: any) => reject(err))
    })
  }

  async close(): Promise<void> {
    if (this.db && this.db.close) {
      await this.db.close()
    }
  }
}

export async function openDatabase(name: string = 'SkedAI.db'): Promise<SQLDatabase> {
  const db = await SQLite.openDatabase({
    name,
    location: 'default',
  })
  return new SQLiteDatabaseAdapter(db)
}

export async function initDatabase(name?: string): Promise<SQLDatabase> {
  const db = await openDatabase(name)
  await runMigrations(db)
  return db
}

export async function closeDatabase(db: SQLDatabase): Promise<void> {
  if (db.close) {
    await db.close()
  }
}


