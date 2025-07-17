import AsyncStorage from '@react-native-async-storage/async-storage'

// Internal task structure for local storage
export interface InternalTask {
  id: string
  name: string
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

export class InternalDB {
  private static instance: InternalDB
  private tasks: InternalTask[] = []
  private actions: InternalAction[] = []
  private loaded = false
  private actionsLoaded = false

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
    
    console.log('🗑️ Deleted task from internal DB:', deletedTask.name)
    return true
  }

  // Save/update a task (upsert functionality)
  async saveTask(taskData: Partial<InternalTask> & { id: string; name: string; start_time: string; end_time: string }): Promise<InternalTask> {
    await this.loadTasks()
    
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
      console.log('➕ Added new task to internal DB:', newTask.name)
      return newTask
    }
  }

  // Clear all tasks
  async clearAllTasks(): Promise<void> {
    this.tasks = []
    await this.saveTasks()
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
}

// Export singleton instance
export const internalDB = InternalDB.getInstance()