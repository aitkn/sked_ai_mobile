import AsyncStorage from '@react-native-async-storage/async-storage'

// Internal task structure for local storage
export interface InternalTask {
  id: string
  name: string
  description?: string // optional task description
  start_time: string // ISO string
  end_time: string   // ISO string
  duration: number   // duration in seconds
  status: 'pending' | 'in_progress' | 'completed' | 'paused' | 'cancelled' // task status
  priority: 'low' | 'medium' | 'high' // task importance
  completed_at?: string // ISO string, optional
  paused_at?: string // ISO string, optional
  cancelled_at?: string // ISO string, optional
  created_at: string // ISO string
  updated_at: string // ISO string
}

// Internal action structure for tracking user actions
export interface InternalAction {
  id: string
  action_type: 'task_started' | 'task_completed' | 'task_skipped' | 'task_paused' | 'task_cancelled' | 'task_resumed'
  task_id: string
  task_name: string
  timestamp: string // ISO string
  details?: string // optional additional information
}

const STORAGE_KEY = 'internal_tasks'
const ACTIONS_STORAGE_KEY = 'internal_actions'
const DELETED_TASKS_STORAGE_KEY = 'internal_deleted_tasks'

export class InternalDB {
  private static instance: InternalDB
  private tasks: InternalTask[] = []
  private actions: InternalAction[] = []
  private loaded = false
  private actionsLoaded = false
  private deletedTaskIds: Set<string> = new Set()
  private deletedLoaded = false

  static getInstance(): InternalDB {
    if (!InternalDB.instance) {
      InternalDB.instance = new InternalDB()
    }
    return InternalDB.instance
  }

  private constructor() {}

  // Load tasks from AsyncStorage
  async loadTasks(): Promise<InternalTask[]> {
    if (this.loaded) {
      return this.tasks
    }

    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY)
      if (stored) {
        this.tasks = JSON.parse(stored)
        console.log('📱 Loaded', this.tasks.length, 'tasks from internal DB')
      } else {
        this.tasks = []
        console.log('📱 No tasks found in internal DB, starting fresh')
      }
      this.loaded = true
      return this.tasks
    } catch (error) {
      console.error('❌ Error loading tasks from internal DB:', error)
      this.tasks = []
      this.loaded = true
      return this.tasks
    }
  }

  // Save tasks to AsyncStorage
  private async saveTasks(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.tasks))
      console.log('💾 Saved', this.tasks.length, 'tasks to internal DB')
    } catch (error) {
      console.error('❌ Error saving tasks to internal DB:', error)
    }
  }

  private async loadDeletedTaskIds(): Promise<Set<string>> {
    if (this.deletedLoaded) {
      return this.deletedTaskIds
    }

    try {
      const stored = await AsyncStorage.getItem(DELETED_TASKS_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          this.deletedTaskIds = new Set(parsed.filter((id: unknown) => typeof id === 'string'))
        } else {
          this.deletedTaskIds = new Set()
        }
      } else {
        this.deletedTaskIds = new Set()
      }
    } catch (error) {
      console.error('❌ Error loading deleted task ids from internal DB:', error)
      this.deletedTaskIds = new Set()
    }

    this.deletedLoaded = true
    return this.deletedTaskIds
  }

  private async saveDeletedTaskIds(): Promise<void> {
    try {
      await AsyncStorage.setItem(DELETED_TASKS_STORAGE_KEY, JSON.stringify(Array.from(this.deletedTaskIds)))
      console.log('💾 Saved', this.deletedTaskIds.size, 'deleted task ids to internal DB')
    } catch (error) {
      console.error('❌ Error saving deleted task ids to internal DB:', error)
    }
  }

  private async markTasksDeleted(taskIds: string[]): Promise<void> {
    if (!taskIds.length) return

    await this.loadDeletedTaskIds()
    let changed = false

    for (const taskId of taskIds) {
      if (!taskId) continue
      if (!this.deletedTaskIds.has(taskId)) {
        this.deletedTaskIds.add(taskId)
        changed = true
      }
    }

    if (changed) {
      await this.saveDeletedTaskIds()
    }
  }

  private async unmarkTaskDeleted(taskId: string): Promise<void> {
    if (!taskId) return

    await this.loadDeletedTaskIds()
    if (this.deletedTaskIds.delete(taskId)) {
      await this.saveDeletedTaskIds()
    }
  }

  async clearDeletedTaskHistory(): Promise<void> {
    await this.loadDeletedTaskIds()
    if (this.deletedTaskIds.size === 0) return

    this.deletedTaskIds.clear()
    await this.saveDeletedTaskIds()
    console.log('🧹 Cleared deleted task history')
  }

  async getDeletedTaskIds(): Promise<string[]> {
    await this.loadDeletedTaskIds()
    return Array.from(this.deletedTaskIds)
  }

  async isTaskDeleted(taskId: string): Promise<boolean> {
    if (!taskId) return false
    await this.loadDeletedTaskIds()
    return this.deletedTaskIds.has(taskId)
  }

  // Get all tasks
  async getAllTasks(): Promise<InternalTask[]> {
    await this.loadTasks()
    return [...this.tasks] // Return copy
  }

  // Get task by ID
  async getTaskById(id: string): Promise<InternalTask | null> {
    await this.loadTasks()
    return this.tasks.find(task => task.id === id) || null
  }

  // Add a new task
  async addTask(taskData: Omit<InternalTask, 'id' | 'created_at' | 'updated_at'>): Promise<InternalTask> {
    await this.loadTasks()
    
    const now = new Date().toISOString()
    const newTask: InternalTask = {
      id: `internal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...taskData,
      created_at: now,
      updated_at: now,
    }

    this.tasks.push(newTask)
    await this.saveTasks()
    await this.unmarkTaskDeleted(newTask.id)
    
    console.log('➕ Added task to internal DB:', newTask.name)
    return newTask
  }

  // Update a task
  async updateTask(id: string, updates: Partial<Omit<InternalTask, 'id' | 'created_at'>>): Promise<InternalTask | null> {
    await this.loadTasks()
    
    const taskIndex = this.tasks.findIndex(task => task.id === id)
    if (taskIndex === -1) {
      console.warn('⚠️ Task not found for update:', id)
      return null
    }

    const updatedTask = {
      ...this.tasks[taskIndex],
      ...updates,
      updated_at: new Date().toISOString(),
    }

    this.tasks[taskIndex] = updatedTask
    await this.saveTasks()
    await this.unmarkTaskDeleted(updatedTask.id)
    
    console.log('📝 Updated task in internal DB:', updatedTask.name)
    return updatedTask
  }

  // Delete a task
  async deleteTask(id: string): Promise<boolean> {
    await this.loadTasks()
    
    const taskIndex = this.tasks.findIndex(task => task.id === id)
    if (taskIndex === -1) {
      console.warn('⚠️ Task not found for deletion:', id)
      return false
    }

    const deletedTask = this.tasks.splice(taskIndex, 1)[0]
    await this.saveTasks()
    await this.markTasksDeleted([deletedTask.id])
    
    console.log('✅ Task deleted:', deletedTask.name)
    return true
  }

  // Save/update a task (upsert functionality)
  // If skipIfDeleted is true, don't restore tasks that are marked as deleted
  async saveTask(taskData: Partial<InternalTask> & { id: string; name: string; start_time: string; end_time: string }, skipIfDeleted: boolean = false): Promise<InternalTask | null> {
    await this.loadTasks()
    
    // Check if task is marked as deleted
    if (skipIfDeleted) {
      const isDeleted = await this.isTaskDeleted(taskData.id)
      if (isDeleted) {
        console.log(`⏭️ Skipping saveTask for deleted task: ${taskData.name} (${taskData.id})`)
        return null
      }
    }
    
    const existingIndex = this.tasks.findIndex(task => task.id === taskData.id)
    const now = new Date().toISOString()
    
    if (existingIndex >= 0) {
      // Update existing task
      const updatedTask = {
        ...this.tasks[existingIndex],
        ...taskData,
        updated_at: now,
      }
      this.tasks[existingIndex] = updatedTask
      await this.saveTasks()
      // Only unmark as deleted if not skipping (i.e., user explicitly saved/updated)
      if (!skipIfDeleted) {
        await this.unmarkTaskDeleted(updatedTask.id)
      }
      console.log('📝 Updated existing task in internal DB:', updatedTask.name)
      return updatedTask
    } else {
      // Create new task
      const newTask: InternalTask = {
        id: taskData.id,
        name: taskData.name,
        start_time: taskData.start_time,
        end_time: taskData.end_time,
        duration: taskData.duration || InternalDB.calculateDuration(taskData.start_time, taskData.end_time),
        status: taskData.status || 'pending',
        priority: taskData.priority || 'medium',
        completed_at: taskData.completed_at,
        created_at: taskData.created_at || now,
        updated_at: now,
      }
      
      this.tasks.push(newTask)
      await this.saveTasks()
      // Only unmark as deleted if not skipping (i.e., user explicitly saved/updated)
      if (!skipIfDeleted) {
        await this.unmarkTaskDeleted(newTask.id)
      }
      console.log('➕ Added new task to internal DB:', newTask.name)
      return newTask
    }
  }

  // Clear all tasks
  async clearAllTasks(): Promise<void> {
    this.tasks = []
    await this.saveTasks()
    await this.clearDeletedTaskHistory()
    console.log('🧹 Cleared all tasks from internal DB')
  }

  // Get tasks within a time range
  async getTasksInRange(startTime: Date, endTime: Date): Promise<InternalTask[]> {
    await this.loadTasks()
    
    const startMs = startTime.getTime()
    const endMs = endTime.getTime()
    
    return this.tasks.filter(task => {
      const taskStartMs = new Date(task.start_time).getTime()
      const taskEndMs = new Date(task.end_time).getTime()
      
      // Task overlaps with the range if:
      // - Task starts before range ends AND task ends after range starts
      return taskStartMs < endMs && taskEndMs > startMs
    })
  }

  // Get current active task
  async getCurrentTask(): Promise<InternalTask | null> {
    await this.loadTasks()
    
    const now = new Date().getTime()
    
    return this.tasks.find(task => {
      const taskStartMs = new Date(task.start_time).getTime()
      const taskEndMs = new Date(task.end_time).getTime()
      return now >= taskStartMs && now < taskEndMs
    }) || null
  }

  // Get next upcoming task
  async getNextTask(): Promise<InternalTask | null> {
    await this.loadTasks()
    
    const now = new Date().getTime()
    
    const upcomingTasks = this.tasks
      .filter(task => new Date(task.start_time).getTime() > now)
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    
    return upcomingTasks[0] || null
  }

  // Helper function to calculate duration from start and end times
  static calculateDuration(startTime: string, endTime: string): number {
    const startMs = new Date(startTime).getTime()
    const endMs = new Date(endTime).getTime()
    return Math.max(0, Math.floor((endMs - startMs) / 1000)) // duration in seconds
  }

  // Helper function to create task with auto-calculated duration
  async addTaskWithDuration(
    name: string, 
    startTime: string, 
    endTime: string
  ): Promise<InternalTask> {
    const duration = InternalDB.calculateDuration(startTime, endTime)
    
    const newTask = await this.addTask({
      name,
      start_time: startTime,
      end_time: endTime,
      duration,
      status: 'pending',
      priority: 'medium',
    })

    // Note: Task creation is a dev/testing feature, not tracked as user action

    return newTask
  }

  // ACTIONS MANAGEMENT

  // Load actions from AsyncStorage
  async loadActions(): Promise<InternalAction[]> {
    if (this.actionsLoaded) {
      return this.actions
    }

    try {
      const stored = await AsyncStorage.getItem(ACTIONS_STORAGE_KEY)
      if (stored) {
        this.actions = JSON.parse(stored)
        console.log('📱 Loaded', this.actions.length, 'actions from internal DB')
      } else {
        this.actions = []
        console.log('📱 No actions found in internal DB, starting fresh')
      }
      this.actionsLoaded = true
      return this.actions
    } catch (error) {
      console.error('❌ Error loading actions from internal DB:', error)
      this.actions = []
      this.actionsLoaded = true
      return this.actions
    }
  }

  // Save actions to AsyncStorage
  private async saveActions(): Promise<void> {
    try {
      await AsyncStorage.setItem(ACTIONS_STORAGE_KEY, JSON.stringify(this.actions))
      console.log('💾 Saved', this.actions.length, 'actions to internal DB')
    } catch (error) {
      console.error('❌ Error saving actions to internal DB:', error)
    }
  }

  // Add a new action
  async addAction(actionData: Omit<InternalAction, 'id' | 'timestamp'>): Promise<InternalAction> {
    await this.loadActions()
    
    const newAction: InternalAction = {
      id: `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...actionData,
      timestamp: new Date().toISOString(),
    }

    this.actions.push(newAction)
    await this.saveActions()
    
    console.log('📝 Added action to internal DB:', newAction.action_type, newAction.task_name)
    return newAction
  }

  // Get all actions
  async getAllActions(): Promise<InternalAction[]> {
    await this.loadActions()
    return [...this.actions].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  }

  // Clear all actions
  async clearAllActions(): Promise<void> {
    this.actions = []
    await this.saveActions()
    console.log('🧹 Cleared all actions from internal DB')
  }

  // Get actions for a specific task
  async getActionsForTask(taskId: string): Promise<InternalAction[]> {
    await this.loadActions()
    return this.actions.filter(action => action.task_id === taskId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  }

  // Get tasks by status
  async getTasksByStatus(status: InternalTask['status']): Promise<InternalTask[]> {
    await this.loadTasks()
    return this.tasks.filter(task => task.status === status)
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
  }

  // Get tasks within a specific time range (enhanced)
  async getTasksInTimeRange(startTime: Date, endTime: Date, includeCompleted: boolean = false): Promise<InternalTask[]> {
    await this.loadTasks()
    
    const startMs = startTime.getTime()
    const endMs = endTime.getTime()
    
    return this.tasks.filter(task => {
      // Filter by completion status if needed
      if (!includeCompleted && task.status === 'completed') {
        return false
      }
      
      const taskStartMs = new Date(task.start_time).getTime()
      const taskEndMs = new Date(task.end_time).getTime()
      
      // Task overlaps with the range if:
      // - Task starts before range ends AND task ends after range starts
      return taskStartMs < endMs && taskEndMs > startMs
    }).sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
  }

  // Update multiple tasks at once
  async updateMultipleTasks(updates: Array<{ id: string; updates: Partial<Omit<InternalTask, 'id' | 'created_at'>> }>): Promise<InternalTask[]> {
    await this.loadTasks()
    
    const updatedTasks: InternalTask[] = []
    
    for (const { id, updates: taskUpdates } of updates) {
      const taskIndex = this.tasks.findIndex(task => task.id === id)
      if (taskIndex !== -1) {
        const updatedTask = {
          ...this.tasks[taskIndex],
          ...taskUpdates,
          updated_at: new Date().toISOString(),
        }
        this.tasks[taskIndex] = updatedTask
        updatedTasks.push(updatedTask)
      }
    }
    
    if (updatedTasks.length > 0) {
      await this.saveTasks()
      console.log('📝 Updated multiple tasks in internal DB:', updatedTasks.length, 'tasks')
    }
    
    return updatedTasks
  }

  // Bulk delete tasks
  async deleteMultipleTasks(taskIds: string[]): Promise<number> {
    await this.loadTasks()
    
    let deletedCount = 0
    const originalLength = this.tasks.length
    const deletedIds: string[] = []
    
    // Remove tasks in reverse order to maintain indices
    for (let i = this.tasks.length - 1; i >= 0; i--) {
      if (taskIds.includes(this.tasks[i].id)) {
        deletedIds.push(this.tasks[i].id)
        this.tasks.splice(i, 1)
        deletedCount++
      }
    }
    
    if (deletedCount > 0) {
      await this.saveTasks()
      await this.markTasksDeleted(deletedIds)
      console.log('🗑️ Deleted multiple tasks from internal DB:', deletedCount, 'tasks')
    }
    
    return deletedCount
  }
}

// Export singleton instance
export const internalDB = InternalDB.getInstance()