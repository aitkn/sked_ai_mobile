import type { SQLDatabase } from '@/db'
import { TaskRepository } from '@/repositories/TaskRepository'
import { EntityRepository } from '@/repositories/EntityRepository'
import { supabase } from './supabaseClient'
import type { Task, Entity } from '@/db/types'

export class SyncManager {
  private taskRepo: TaskRepository
  private entityRepo: EntityRepository

  constructor(db: SQLDatabase) {
    this.taskRepo = new TaskRepository(db)
    this.entityRepo = new EntityRepository(db)
  }

  async syncFromSupabase(userId: string): Promise<{ tasks: number; entities: number }> {
    // Pull tasks
    const taskResp = await supabase.from('tasks').select('*').eq('user_id', userId)
    if (taskResp.error) {
      throw new Error(`Failed to fetch tasks: ${taskResp.error.message}`)
    }
    const tasks = (taskResp.data || []) as Task[]
    await this.taskRepo.bulkUpsert(tasks)

    // Pull entities
    const entityResp = await supabase.from('entities').select('*').eq('user_id', userId)
    if (entityResp.error) {
      throw new Error(`Failed to fetch entities: ${entityResp.error.message}`)
    }
    const entities = (entityResp.data || []) as Entity[]
    await this.entityRepo.bulkUpsert(entities)

    return { tasks: tasks.length, entities: entities.length }
  }

  // Placeholder for future push sync logic
  async syncToSupabase(_userId: string): Promise<void> {
    // Identify local changes and push to Supabase
    // Not implemented in this iteration
    return
  }
}


