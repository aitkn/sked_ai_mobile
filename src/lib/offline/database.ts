import AsyncStorage from '@react-native-async-storage/async-storage'

export interface Task {
  id: string
  task_id?: string // Supabase ID
  local_id: string // Local ID for offline
  user_id: string
  name: string
  task_json?: any
  status: 'pending' | 'completed' | 'in_progress' | 'created'
  start_time?: string // ISO string for task start time
  end_time?: string // ISO string for task end time
  due_at?: string
  reminder_at?: string
  completed_at?: string
  priority: 'low' | 'medium' | 'high'
  sync_status: 'synced' | 'pending' | 'conflict'
  created_at: string
  updated_at: string
  deleted_at?: string
}

export interface SyncMetadata {
  lastSyncAt: string
  pendingChanges: number
}

const TASKS_KEY = '@skedai_tasks'
const SYNC_KEY = '@skedai_sync_metadata'
const QUEUE_KEY = '@skedai_sync_queue'

export class OfflineDatabase {
  // Get all tasks from local storage
  async getTasks(): Promise<Task[]> {
    try {
      const tasksJson = await AsyncStorage.getItem(TASKS_KEY)
      return tasksJson ? JSON.parse(tasksJson) : []
    } catch (error) {
      console.error('Error getting tasks:', error)
      return []
    }
  }

  // Get a single task by local ID
  async getTask(localId: string): Promise<Task | null> {
    const tasks = await this.getTasks()
    return tasks.find(t => t.local_id === localId) || null
  }

  // Save tasks to local storage
  async saveTasks(tasks: Task[]): Promise<void> {
    try {
      await AsyncStorage.setItem(TASKS_KEY, JSON.stringify(tasks))
    } catch (error) {
      console.error('Error saving tasks:', error)
      throw error
    }
  }

  // Add or update a task
  async upsertTask(task: Task): Promise<void> {
    const tasks = await this.getTasks()
    const index = tasks.findIndex(t => t.local_id === task.local_id)
    
    if (index >= 0) {
      tasks[index] = {
        ...tasks[index],
        ...task,
        updated_at: new Date().toISOString(),
      }
    } else {
      tasks.push({
        ...task,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    }
    
    await this.saveTasks(tasks)
    
    // Add to sync queue if offline
    if (task.sync_status === 'pending') {
      await this.addToSyncQueue(task)
    }
  }

  // Soft delete a task
  async deleteTask(localId: string): Promise<void> {
    const tasks = await this.getTasks()
    const task = tasks.find(t => t.local_id === localId)
    
    if (task) {
      task.deleted_at = new Date().toISOString()
      task.sync_status = 'pending'
      await this.saveTasks(tasks)
      await this.addToSyncQueue(task)
      console.log('✅ Task deleted:', task.name || localId)
    }
  }

  // Get tasks that need syncing
  async getPendingTasks(): Promise<Task[]> {
    const tasks = await this.getTasks()
    return tasks.filter(t => t.sync_status === 'pending')
  }

  // Add task to sync queue
  async addToSyncQueue(task: Task): Promise<void> {
    try {
      const queueJson = await AsyncStorage.getItem(QUEUE_KEY)
      const queue = queueJson ? JSON.parse(queueJson) : []
      
      // Remove existing entry for this task
      const filteredQueue = queue.filter((t: Task) => t.local_id !== task.local_id)
      
      // Add updated task to queue
      filteredQueue.push(task)
      
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(filteredQueue))
    } catch (error) {
      console.error('Error adding to sync queue:', error)
    }
  }

  // Get sync queue
  async getSyncQueue(): Promise<Task[]> {
    try {
      const queueJson = await AsyncStorage.getItem(QUEUE_KEY)
      return queueJson ? JSON.parse(queueJson) : []
    } catch (error) {
      console.error('Error getting sync queue:', error)
      return []
    }
  }

  // Clear sync queue
  async clearSyncQueue(): Promise<void> {
    await AsyncStorage.removeItem(QUEUE_KEY)
  }

  // Get sync metadata
  async getSyncMetadata(): Promise<SyncMetadata> {
    try {
      const metadataJson = await AsyncStorage.getItem(SYNC_KEY)
      return metadataJson ? JSON.parse(metadataJson) : {
        lastSyncAt: new Date(0).toISOString(),
        pendingChanges: 0,
      }
    } catch (error) {
      return {
        lastSyncAt: new Date(0).toISOString(),
        pendingChanges: 0,
      }
    }
  }

  // Update sync metadata
  async updateSyncMetadata(metadata: Partial<SyncMetadata>): Promise<void> {
    const current = await this.getSyncMetadata()
    await AsyncStorage.setItem(SYNC_KEY, JSON.stringify({
      ...current,
      ...metadata,
    }))
  }

  // Clear all data
  async clearAll(): Promise<void> {
    await AsyncStorage.multiRemove([TASKS_KEY, SYNC_KEY, QUEUE_KEY])
  }
}