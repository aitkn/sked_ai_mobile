import { BaseRepository } from './BaseRepository'
import type { Task } from '@/db/types'
import type { SQLDatabase } from '@/db'

export class TaskRepository extends BaseRepository {
  constructor(db: SQLDatabase) {
    super(db)
  }

  async getById(taskId: string): Promise<Task | null> {
    return this.queryOne<Task>('SELECT * FROM tasks WHERE task_id = ?', [taskId])
  }

  async listByUser(userId: string): Promise<Task[]> {
    return this.queryAll<Task>('SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC', [userId])
  }

  async create(task: Task): Promise<void> {
    await this.run(
      `INSERT INTO tasks (task_id, user_id, task_type, is_top, task_group_id, created_at, new_field)
       VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime('now')), ?)`,
      [
        task.task_id,
        task.user_id,
        task.task_type ?? null,
        task.is_top ?? 0,
        task.task_group_id ?? null,
        task.created_at ?? null,
        task.new_field ?? null,
      ]
    )
  }

  async update(taskId: string, updates: Partial<Task>): Promise<number> {
    const fields: string[] = []
    const values: unknown[] = []
    const set = (col: keyof Task, val: unknown) => {
      fields.push(`${String(col)} = ?`)
      values.push(val)
    }
    if (updates.user_id !== undefined) set('user_id', updates.user_id)
    if (updates.task_type !== undefined) set('task_type', updates.task_type)
    if (updates.is_top !== undefined) set('is_top', updates.is_top)
    if (updates.task_group_id !== undefined) set('task_group_id', updates.task_group_id)
    if (updates.created_at !== undefined) set('created_at', updates.created_at)
    if (updates.new_field !== undefined) set('new_field', updates.new_field)

    if (fields.length === 0) return 0
    values.push(taskId)
    return this.run(`UPDATE tasks SET ${fields.join(', ')} WHERE task_id = ?`, values)
  }

  async delete(taskId: string): Promise<number> {
    return this.run('DELETE FROM tasks WHERE task_id = ?', [taskId])
  }

  async bulkUpsert(tasks: Task[]): Promise<void> {
    if (tasks.length === 0) return
    await this.db.transaction(async (tx) => {
      for (const t of tasks) {
        const updated = await tx.executeSql(
          `UPDATE tasks SET user_id = ?, task_type = ?, is_top = ?, task_group_id = ?, created_at = COALESCE(?, created_at), new_field = ?
           WHERE task_id = ?`,
          [
            t.user_id,
            t.task_type ?? null,
            t.is_top ?? 0,
            t.task_group_id ?? null,
            t.created_at ?? null,
            t.new_field ?? null,
            t.task_id,
          ]
        )
        const rowsAffected = updated?.[0]?.rowsAffected ?? 0
        if (rowsAffected === 0) {
          await tx.executeSql(
            `INSERT INTO tasks (task_id, user_id, task_type, is_top, task_group_id, created_at, new_field)
             VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime('now')), ?)`,
            [
              t.task_id,
              t.user_id,
              t.task_type ?? null,
              t.is_top ?? 0,
              t.task_group_id ?? null,
              t.created_at ?? null,
              t.new_field ?? null,
            ]
          )
        }
      }
      return Promise.resolve()
    })
  }
}


