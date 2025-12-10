import { BaseRepository } from './BaseRepository'
import type { SQLDatabase } from '@/db'
import type { InternalActionRecord } from '@/db/types'

export class InternalActionRepository extends BaseRepository {
  constructor(db: SQLDatabase) {
    super(db)
  }

  async getAll(): Promise<InternalActionRecord[]> {
    return this.queryAll<InternalActionRecord>(
      'SELECT * FROM internal_actions ORDER BY datetime(timestamp) DESC'
    )
  }

  async getByTaskId(taskId: string): Promise<InternalActionRecord[]> {
    return this.queryAll<InternalActionRecord>(
      'SELECT * FROM internal_actions WHERE task_id = ? ORDER BY datetime(timestamp) DESC',
      [taskId]
    )
  }

  async add(action: InternalActionRecord): Promise<void> {
    await this.run(
      `INSERT INTO internal_actions (
        id, action_type, task_id, task_name, timestamp, details
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        action.id,
        action.action_type,
        action.task_id,
        action.task_name,
        action.timestamp,
        action.details ?? null,
      ]
    )
  }

  async clear(): Promise<void> {
    await this.run('DELETE FROM internal_actions')
  }
}


