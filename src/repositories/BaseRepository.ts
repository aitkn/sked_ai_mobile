import { SQLDatabase, SQLResultRow } from '@/db'

export class BaseRepository {
  protected db: SQLDatabase

  constructor(db: SQLDatabase) {
    this.db = db
  }

  protected async run(sql: string, params: unknown[] = []): Promise<number> {
    const res = await this.db.executeSql(sql, params)
    const rowsAffected = res?.[0]?.rowsAffected ?? 0
    return rowsAffected
  }

  protected async queryAll<T = SQLResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
    const res = await this.db.executeSql(sql, params)
    const rows = res[0].rows
    const out: T[] = []
    for (let i = 0; i < rows.length; i++) {
      out.push(rows.item(i) as unknown as T)
    }
    return out
  }

  protected async queryOne<T = SQLResultRow>(sql: string, params: unknown[] = []): Promise<T | null> {
    const res = await this.db.executeSql(sql, params)
    const rows = res[0].rows
    if (rows.length === 0) return null
    return rows.item(0) as unknown as T
  }
}


