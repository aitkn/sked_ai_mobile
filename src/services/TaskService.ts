import AsyncStorage from '@react-native-async-storage/async-storage'
import { initDatabase, SQLDatabase } from '@/db'
import { InternalTaskRepository } from '@/repositories/InternalTaskRepository'
import { InternalActionRepository } from '@/repositories/InternalActionRepository'
import type { InternalTaskRecord, InternalActionRecord } from '@/db/types'
import { InternalDB, internalDB, InternalTask as LegacyTask, InternalAction as LegacyAction } from '@/lib/internal-db'

export type InternalTask = LegacyTask
export type InternalAction = LegacyAction

const LEGACY_TASKS_KEY = 'internal_tasks'
const LEGACY_ACTIONS_KEY = 'internal_actions'

function generateId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

export class TaskService {
  private static instance: TaskService
  private dbPromise: Promise<SQLDatabase> | null = null
  private taskRepo?: InternalTaskRepository
  private actionRepo?: InternalActionRepository

  static getInstance(): TaskService {
    if (!TaskService.instance) {
      TaskService.instance = new TaskService()
    }
    return TaskService.instance
  }

  private async getDb(): Promise<SQLDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = initDatabase()
    }
    return this.dbPromise
  }

  async getDatabase(): Promise<SQLDatabase> {
    return this.getDb()
  }

  private async ensureRepos() {
    if (!this.taskRepo || !this.actionRepo) {
      const db = await this.getDb()
      if (!this.taskRepo) {
        this.taskRepo = new InternalTaskRepository(db)
      }
      if (!this.actionRepo) {
        this.actionRepo = new InternalActionRepository(db)
      }
    }
    return {
      taskRepo: this.taskRepo!,
      actionRepo: this.actionRepo!,
    }
  }

  private static toRecord(task: InternalTask): InternalTaskRecord {
    return {
      id: task.id,
      name: task.name,
      start_time: task.start_time,
      end_time: task.end_time,
      duration: task.duration,
      status: task.status,
      priority: task.priority,
      completed_at: task.completed_at ?? null,
      paused_at: task.paused_at ?? null,
      cancelled_at: task.cancelled_at ?? null,
      created_at: task.created_at,
      updated_at: task.updated_at,
    }
  }

  private static fromRecord(record: InternalTaskRecord): InternalTask {
    return {
      id: record.id,
      name: record.name,
      start_time: record.start_time,
      end_time: record.end_time,
      duration: record.duration,
      status: record.status,
      priority: record.priority,
      completed_at: record.completed_at ?? undefined,
      paused_at: record.paused_at ?? undefined,
      cancelled_at: record.cancelled_at ?? undefined,
      created_at: record.created_at,
      updated_at: record.updated_at,
    }
  }

  private static actionToRecord(action: InternalAction): InternalActionRecord {
    return {
      id: action.id,
      action_type: action.action_type,
      task_id: action.task_id,
      task_name: action.task_name,
      timestamp: action.timestamp,
      details: action.details ?? null,
    }
  }

  private static actionFromRecord(record: InternalActionRecord): InternalAction {
    return {
      id: record.id,
      action_type: record.action_type,
      task_id: record.task_id,
      task_name: record.task_name,
      timestamp: record.timestamp,
      details: record.details ?? undefined,
    }
  }

  async getAllTasks(): Promise<InternalTask[]> {
    const { taskRepo } = await this.ensureRepos()
    const rows = await taskRepo.getAll()
    return rows.map(TaskService.fromRecord)
  }

  async getTaskById(id: string): Promise<InternalTask | null> {
    const { taskRepo } = await this.ensureRepos()
    const record = await taskRepo.getById(id)
    return record ? TaskService.fromRecord(record) : null
  }

  async addTask(
    taskData: Omit<InternalTask, 'id' | 'created_at' | 'updated_at'>
  ): Promise<InternalTask> {
    const now = new Date().toISOString()
    const newTask: InternalTask = {
      id: generateId('internal'),
      ...taskData,
      created_at: now,
      updated_at: now,
    }

    const { taskRepo } = await this.ensureRepos()
    await taskRepo.add(TaskService.toRecord(newTask))
    return newTask
  }

  async addTaskWithDuration(name: string, startTime: string, endTime: string): Promise<InternalTask> {
    const duration = TaskService.calculateDuration(startTime, endTime)
    return this.addTask({
      name,
      start_time: startTime,
      end_time: endTime,
      duration,
      status: 'pending',
      priority: 'medium',
    })
  }

  async updateTask(id: string, updates: Partial<Omit<InternalTask, 'id' | 'created_at'>>): Promise<InternalTask | null> {
    const { taskRepo } = await this.ensureRepos()
    const existing = await taskRepo.getById(id)
    if (!existing) {
      return null
    }

    const now = new Date().toISOString()
    const updatePayload: Partial<InternalTaskRecord> = {
      ...updates,
      updated_at: now,
    }

    await taskRepo.update(id, updatePayload)

    const updated = await taskRepo.getById(id)
    return updated ? TaskService.fromRecord(updated) : null
  }

  async deleteTask(id: string): Promise<boolean> {
    const { taskRepo } = await this.ensureRepos()
    const result = await taskRepo.delete(id)
    return result > 0
  }

  async saveTask(taskData: Partial<InternalTask> & { id: string; name: string; start_time: string; end_time: string }): Promise<InternalTask> {
    const existing = await this.getTaskById(taskData.id)
    if (existing) {
      const updated = await this.updateTask(taskData.id, {
        ...existing,
        ...taskData,
        duration: taskData.duration ?? existing.duration,
        priority: taskData.priority ?? existing.priority,
        status: taskData.status ?? existing.status,
      })
      return updated ?? existing
    }

    const now = new Date().toISOString()
    const newTask: InternalTask = {
      id: taskData.id,
      name: taskData.name,
      start_time: taskData.start_time,
      end_time: taskData.end_time,
      duration: taskData.duration ?? TaskService.calculateDuration(taskData.start_time, taskData.end_time),
      status: taskData.status ?? 'pending',
      priority: taskData.priority ?? 'medium',
      completed_at: taskData.completed_at,
      paused_at: taskData.paused_at,
      cancelled_at: taskData.cancelled_at,
      created_at: taskData.created_at ?? now,
      updated_at: now,
    }

    const { taskRepo } = await this.ensureRepos()
    await taskRepo.add(TaskService.toRecord(newTask))
    return newTask
  }

  async clearAllTasks(): Promise<void> {
    const { taskRepo } = await this.ensureRepos()
    await taskRepo.clear()
  }

  async getTasksInRange(start: Date, end: Date): Promise<InternalTask[]> {
    const tasks = await this.getAllTasks()
    const startMs = start.getTime()
    const endMs = end.getTime()
    return tasks.filter(task => {
      const s = new Date(task.start_time).getTime()
      const e = new Date(task.end_time).getTime()
      return s < endMs && e > startMs
    })
  }

  async getCurrentTask(): Promise<InternalTask | null> {
    const now = Date.now()
    const tasks = await this.getAllTasks()
    return (
      tasks.find(task => {
        const start = new Date(task.start_time).getTime()
        const end = new Date(task.end_time).getTime()
        return now >= start && now < end
      }) ?? null
    )
  }

  async getNextTask(): Promise<InternalTask | null> {
    const now = Date.now()
    const tasks = await this.getAllTasks()
    const upcoming = tasks
      .filter(task => new Date(task.start_time).getTime() > now)
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    return upcoming[0] ?? null
  }

  async getAllActions(): Promise<InternalAction[]> {
    const { actionRepo } = await this.ensureRepos()
    const rows = await actionRepo.getAll()
    return rows.map(TaskService.actionFromRecord)
  }

  async getActionsForTask(taskId: string): Promise<InternalAction[]> {
    const { actionRepo } = await this.ensureRepos()
    const rows = await actionRepo.getByTaskId(taskId)
    return rows.map(TaskService.actionFromRecord)
  }

  async addAction(actionData: Omit<InternalAction, 'id' | 'timestamp'>): Promise<InternalAction> {
    const now = new Date().toISOString()
    const action: InternalAction = {
      id: generateId('action'),
      ...actionData,
      timestamp: now,
    }
    const { actionRepo } = await this.ensureRepos()
    await actionRepo.add(TaskService.actionToRecord(action))
    return action
  }

  async clearAllActions(): Promise<void> {
    const { actionRepo } = await this.ensureRepos()
    await actionRepo.clear()
  }

  static calculateDuration(startTime: string, endTime: string): number {
    const startMs = new Date(startTime).getTime()
    const endMs = new Date(endTime).getTime()
    return Math.max(0, Math.floor((endMs - startMs) / 1000))
  }

  /**
   * Import existing AsyncStorage-based internal DB data into SQLite.
   * This is a one-time helper to migrate legacy data.
   */
  async importFromLegacyStorage(): Promise<{ tasks: number; actions: number }> {
    const tasksJson = await AsyncStorage.getItem(LEGACY_TASKS_KEY)
    const actionsJson = await AsyncStorage.getItem(LEGACY_ACTIONS_KEY)
    const tasks: LegacyTask[] = tasksJson ? JSON.parse(tasksJson) : []
    const actions: LegacyAction[] = actionsJson ? JSON.parse(actionsJson) : []

    if (tasks.length === 0 && actions.length === 0) {
      return { tasks: 0, actions: 0 }
    }

    const { taskRepo, actionRepo } = await this.ensureRepos()

    for (const task of tasks) {
      await taskRepo.add(TaskService.toRecord(task))
    }
    for (const action of actions) {
      await actionRepo.add(TaskService.actionToRecord(action))
    }

    return { tasks: tasks.length, actions: actions.length }
  }

  /**
   * Fall back to legacy internalDB if we encounter issues during rollout.
   */
  getLegacyInternalDB(): InternalDB {
    return internalDB
  }
}


