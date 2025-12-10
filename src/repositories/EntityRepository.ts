import { BaseRepository } from './BaseRepository'
import type { Entity } from '@/db/types'
import type { SQLDatabase } from '@/db'

export class EntityRepository extends BaseRepository {
  constructor(db: SQLDatabase) {
    super(db)
  }

  async getById(entityId: string): Promise<Entity | null> {
    return this.queryOne<Entity>('SELECT * FROM entities WHERE entity_id = ?', [entityId])
  }

  async listByUser(userId: string): Promise<Entity[]> {
    return this.queryAll<Entity>('SELECT * FROM entities WHERE user_id = ? ORDER BY created_at DESC', [userId])
  }

  async create(entity: Entity): Promise<void> {
    await this.run(
      `INSERT INTO entities (entity_id, user_id, is_person, created_at)
       VALUES (?, ?, ?, COALESCE(?, datetime('now')))`,
      [entity.entity_id, entity.user_id, entity.is_person ?? 0, entity.created_at ?? null]
    )
  }

  async update(entityId: string, updates: Partial<Entity>): Promise<number> {
    const fields: string[] = []
    const values: unknown[] = []
    const set = (col: keyof Entity, val: unknown) => {
      fields.push(`${String(col)} = ?`)
      values.push(val)
    }

    if (updates.user_id !== undefined) set('user_id', updates.user_id)
    if (updates.is_person !== undefined) set('is_person', updates.is_person)
    if (updates.created_at !== undefined) set('created_at', updates.created_at)

    if (fields.length === 0) return 0
    values.push(entityId)
    return this.run(`UPDATE entities SET ${fields.join(', ')} WHERE entity_id = ?`, values)
  }

  async delete(entityId: string): Promise<number> {
    return this.run('DELETE FROM entities WHERE entity_id = ?', [entityId])
  }

  async bulkUpsert(entities: Entity[]): Promise<void> {
    if (entities.length === 0) return
    await this.db.transaction(async (tx) => {
      for (const e of entities) {
        const updated = await tx.executeSql(
          `UPDATE entities SET user_id = ?, is_person = ?, created_at = COALESCE(?, created_at)
           WHERE entity_id = ?`,
          [e.user_id, e.is_person ?? 0, e.created_at ?? null, e.entity_id]
        )
        const rowsAffected = updated?.[0]?.rowsAffected ?? 0
        if (rowsAffected === 0) {
          await tx.executeSql(
            `INSERT INTO entities (entity_id, user_id, is_person, created_at)
             VALUES (?, ?, ?, COALESCE(?, datetime('now')))`,
            [e.entity_id, e.user_id, e.is_person ?? 0, e.created_at ?? null]
          )
        }
      }
      return Promise.resolve()
    })
  }
}


