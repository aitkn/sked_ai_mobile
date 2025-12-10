import { BaseRepository } from './BaseRepository'
import type { SQLDatabase } from '@/db'
import type { InternalTaskRecord } from '@/db/types'

export class InternalTaskRepository extends BaseRepository {
  constructor(db: SQLDatabase) {
    super(db)
  }

  async getAll(): Promise<InternalTaskRecord[]> {
    return this.queryAll<InternalTaskRecord>(
      'SELECT * FROM internal_tasks ORDER BY datetime(start_time) ASC'
    )
  }

  async getById(id: string): Promise<InternalTaskRecord | null> {
    return this.queryOne<InternalTaskRecord>('SELECT * FROM internal_tasks WHERE id = ?', [id])
  }

  async add(task: InternalTaskRecord): Promise<void> {
    await this.run(
      `INSERT INTO internal_tasks (
        id, name, start_time, end_time, duration, status, priority,
        completed_at, paused_at, cancelled_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        task.id,
        task.name,
        task.start_time,
        task.end_time,
        task.duration,
        task.status,
        task.priority,
        task.completed_at ?? null,
        task.paused_at ?? null,
        task.cancelled_at ?? null,
        task.created_at,
        task.updated_at,
      ]
    )
  }

  async update(id: string, updates: Partial<InternalTaskRecord>): Promise<number> {
    const fields: string[] = []
    const values: unknown[] = []

    const setField = <K extends keyof InternalTaskRecord>(field: K, value: InternalTaskRecord[K]) => {
      fields.push(`${String(field)} = ?`)
      values.push(value)
    }

    if (updates.name !== undefined) setField('name', updates.name)
    if (updates.start_time !== undefined) setField('start_time', updates.start_time)
    if (updates.end_time !== undefined) setField('end_time', updates.end_time)
    if (updates.duration !== undefined) setField('duration', updates.duration)
    if (updates.status !== undefined) setField('status', updates.status)
    if (updates.priority !== undefined) setField('priority', updates.priority)
    if (updates.completed_at !== undefined) setField('completed_at', updates.completed_at ?? null)
    if (updates.paused_at !== undefined) setField('paused_at', updates.paused_at ?? null)
    if (updates.cancelled_at !== undefined) setField('cancelled_at', updates.cancelled_at ?? null)
    if (updates.updated_at !== undefined) setField('updated_at', updates.updated_at)

    if (fields.length === 0) {
      return 0
    }

    values.push(id)
    return this.run(`UPDATE internal_tasks SET ${fields.join(', ')} WHERE id = ?`, values)
  }

  async delete(id: string): Promise<number> {
    return this.run('DELETE FROM internal_tasks WHERE id = ?', [id])
  }

  async clear(): Promise<void> {
    await this.run('DELETE FROM internal_tasks')
  }
}


