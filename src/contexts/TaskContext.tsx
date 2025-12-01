import React, { createContext, useContext, useEffect, useState } from 'react'
import { AppState, AppStateStatus } from 'react-native'
import { SyncService } from '../lib/offline/sync'
import { NotificationService } from '../lib/notifications/service'
import { Task } from '../lib/offline/database'
import { supabase } from '../lib/supabase'

interface TaskContextType {
  tasks: Task[]
  loading: boolean
  syncing: boolean
  createTask: (task: Partial<Task>) => Promise<Task>
  updateTask: (localId: string, updates: Partial<Task>) => Promise<void>
  deleteTask: (localId: string) => Promise<void>
  syncNow: () => Promise<void>
  refreshTasks: () => Promise<void>
}

const TaskContext = createContext<TaskContextType | null>(null)

export function useTaskContext() {
  const context = useContext(TaskContext)
  if (!context) {
    throw new Error('useTaskContext must be used within TaskProvider')
  }
  return context
}

export function TaskProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  
  const syncService = new SyncService()
  const notificationService = new NotificationService()

  // Initialize services
  useEffect(() => {
    async function init() {
      try {
        // Initialize notifications
        await notificationService.initialize()
        
        // Load initial tasks
        await refreshTasks()
        
        // Setup app state listener for background/foreground
        const subscription = AppState.addEventListener('change', handleAppStateChange)
        
        // Initial sync
        syncNow()
        
        setLoading(false)
        
        return () => {
          subscription.remove()
        }
      } catch (error) {
        console.error('Error initializing task context:', error)
        setLoading(false)
      }
    }
    
    init()
  }, [])

  // Handle app state changes
  const handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (nextAppState === 'active') {
      // App came to foreground, sync
      syncNow()
    }
  }

  // Refresh tasks from local storage
  const refreshTasks = async () => {
    const activeTasks = await syncService.getActiveTasks()
    setTasks(activeTasks)
    
    // Reschedule all notifications
    await notificationService.scheduleAllNotifications(activeTasks)
  }

  // Create a new task
  const createTask = async (task: Partial<Task>): Promise<Task> => {
    const newTask = await syncService.createTask(task)
    
    // Schedule notifications if needed
    if (newTask.reminder_at) {
      await notificationService.scheduleTaskNotification(newTask, 'reminder')
    }
    if (newTask.due_at) {
      await notificationService.scheduleTaskNotification(newTask, 'due')
    }
    
    await refreshTasks()
    return newTask
  }

  // Update a task
  const updateTask = async (localId: string, updates: Partial<Task>) => {
    // Cancel existing notifications
    await notificationService.cancelTaskNotifications(localId)
    
    // Update task
    await syncService.updateTask(localId, updates)
    
    // Get updated task and reschedule notifications
    const tasks = await syncService.getActiveTasks()
    const updatedTask = tasks.find(t => t.local_id === localId)
    
    if (updatedTask && !updatedTask.deleted_at) {
      if (updatedTask.reminder_at) {
        await notificationService.scheduleTaskNotification(updatedTask, 'reminder')
      }
      if (updatedTask.due_at) {
        await notificationService.scheduleTaskNotification(updatedTask, 'due')
      }
    }
    
    await refreshTasks()
  }

  // Delete a task
  const deleteTask = async (localId: string) => {
    // Cancel notifications
    await notificationService.cancelTaskNotifications(localId)
    
    // Delete task
    await syncService.deleteTask(localId)
    
    const task = tasks.find(t => t.local_id === localId)
    if (task) {
      console.log('✅ Task deleted:', task.name || task.local_id)
    }
    
    await refreshTasks()
  }

  // Manual sync
  const syncNow = async () => {
    setSyncing(true)
    try {
      await syncService.sync()
      await refreshTasks()
      
      // Log current sync status
      const tasks = await syncService.getActiveTasks()
      const pendingCount = tasks.filter(t => t.sync_status === 'pending').length
      console.log(`After sync: ${pendingCount} tasks pending, ${tasks.length} total tasks`)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <TaskContext.Provider
      value={{
        tasks,
        loading,
        syncing,
        createTask,
        updateTask,
        deleteTask,
        syncNow,
        refreshTasks,
      }}
    >
      {children}
    </TaskContext.Provider>
  )
}