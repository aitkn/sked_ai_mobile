import { supabase } from '../supabase'
import { OfflineDatabase, Task } from './database'
import NetInfo from '@react-native-community/netinfo'
// Background fetch requires native setup, commenting out for now
// import BackgroundFetch from 'react-native-background-fetch'

export class SyncService {
  private db: OfflineDatabase
  private isSyncing = false

  constructor() {
    this.db = new OfflineDatabase()
    this.setupBackgroundSync()
    this.setupNetworkListener()
  }

  // Setup background sync
  private async setupBackgroundSync() {
    // Background fetch requires native module setup
    // For now, we'll rely on:
    // 1. Sync when app comes to foreground
    // 2. Sync when network reconnects
    // 3. Manual sync via pull-to-refresh
    
    // TODO: To enable background sync:
    // 1. Eject from Expo or use EAS Build
    // 2. Install react-native-background-fetch
    // 3. Configure native iOS/Android projects
    
    console.log('Background sync placeholder - using foreground sync only')
  }

  // Setup network state listener
  private setupNetworkListener() {
    NetInfo.addEventListener(state => {
      if (state.isConnected && !this.isSyncing) {
        // Sync when coming back online
        this.sync()
      }
    })
  }

  // Main sync function
  async sync(): Promise<void> {
    if (this.isSyncing) return
    
    this.isSyncing = true
    console.log('Starting sync...')

    try {
      const networkState = await NetInfo.fetch()
      if (!networkState.isConnected) {
        console.log('No network connection, skipping sync')
        return
      }

      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        console.log('No authenticated user, skipping sync')
        return
      }

      // 1. Push local changes
      await this.pushChanges(user.id)

      // 2. Pull remote changes
      await this.pullChanges(user.id)

      // 3. Update sync metadata
      await this.db.updateSyncMetadata({
        lastSyncAt: new Date().toISOString(),
        pendingChanges: 0,
      })

      console.log('Sync completed successfully')
    } catch (error) {
      console.error('Sync error:', error)
    } finally {
      this.isSyncing = false
    }
  }

  // Push local changes to Supabase
  private async pushChanges(userId: string): Promise<void> {
    const pendingTasks = await this.db.getPendingTasks()
    console.log(`Pushing ${pendingTasks.length} pending tasks`)
    
    if (pendingTasks.length === 0) {
      console.log('No pending tasks to push')
      return
    }

    for (const task of pendingTasks) {
      console.log(`Pushing task ${task.local_id} with status ${task.sync_status}`)
      try {
        if (task.deleted_at) {
          // Handle deletion
          if (task.task_id) {
            await supabase
              .from('tasks')
              .update({ deleted_at: task.deleted_at })
              .eq('task_id', task.task_id)
          }
        } else if (task.task_id) {
          // Update existing task
          // Include end_time in task_json if it exists
          const taskJson = {
            ...(task.task_json || {}),
            start_time: task.start_time,
            end_time: task.end_time,
          }
          
          const { error } = await supabase
            .from('tasks')
            .update({
              name: task.name,
              task_json: taskJson,
              status: task.status,
              due_at: task.due_at,
              reminder_at: task.reminder_at,
              completed_at: task.completed_at,
              priority: task.priority,
              updated_at: task.updated_at,
            })
            .eq('task_id', task.task_id)

          if (error) throw error
        } else {
          // Check if task already exists with this local_id to prevent duplicates
          const { data: existingTask } = await supabase
            .from('tasks')
            .select('task_id')
            .eq('local_id', task.local_id)
            .single()
          
          if (existingTask) {
            // Task already exists, just update local reference
            task.task_id = existingTask.task_id
          } else {
            // Create new task
            // Include end_time in task_json if it exists
            const taskJson = {
              ...(task.task_json || {}),
              start_time: task.start_time,
              end_time: task.end_time,
            }
            
            const { data, error } = await supabase
              .from('tasks')
              .insert({
                user_id: userId,
                name: task.name,
                task_json: taskJson,
                status: task.status,
                  due_at: task.due_at,
                reminder_at: task.reminder_at,
                completed_at: task.completed_at,
                priority: task.priority,
                local_id: task.local_id,
                sync_status: 'synced',
              })
              .select()
              .single()

            if (error) throw error

            // Update local task with server ID
            task.task_id = data.task_id
          }
        }

        // Mark as synced
        task.sync_status = 'synced'
        await this.db.upsertTask(task)
        console.log(`Successfully synced task ${task.local_id}`)
      } catch (error) {
        console.error('Error pushing task:', task.local_id, error)
        // Keep in pending state for retry
      }
    }
    
    // Log final state
    const remainingPending = await this.db.getPendingTasks()
    console.log(`After push: ${remainingPending.length} tasks still pending`)
  }

  // Pull remote changes from Supabase
  private async pullChanges(userId: string): Promise<void> {
    const metadata = await this.db.getSyncMetadata()
    
    // Get tasks updated since last sync
    const { data: remoteTasks, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .gte('updated_at', metadata.lastSyncAt)
      .order('updated_at', { ascending: true })

    if (error) {
      console.error('Error pulling tasks:', error)
      return
    }

    console.log(`Pulling ${remoteTasks?.length || 0} remote tasks`)

    const localTasks = await this.db.getTasks()
    
    for (const remoteTask of remoteTasks || []) {
      const localTask = localTasks.find(
        t => t.task_id === remoteTask.task_id || t.local_id === remoteTask.local_id
      )

      if (localTask) {
        // Check for conflicts
        if (localTask.sync_status === 'pending' && 
            new Date(localTask.updated_at) > new Date(remoteTask.updated_at)) {
          // Local changes are newer, skip this remote update
          console.log('Conflict detected, keeping local changes for:', localTask.local_id)
          continue
        }
      }

      // Apply remote changes
      // Extract start_time and end_time from task_json if they exist
      const taskJson = remoteTask.task_json || {}
      const startTime = taskJson.start_time
      const endTime = taskJson.end_time
      
      const task: Task = {
        id: remoteTask.task_id,
        task_id: remoteTask.task_id,
        local_id: remoteTask.local_id || `remote_${remoteTask.task_id}`,
        user_id: remoteTask.user_id,
        name: remoteTask.name,
        task_json: remoteTask.task_json,
        status: remoteTask.status,
        start_time: startTime,
        end_time: endTime,
        due_at: remoteTask.due_at,
        reminder_at: remoteTask.reminder_at,
        completed_at: remoteTask.completed_at,
        priority: remoteTask.priority || 'medium',
        sync_status: 'synced',
        created_at: remoteTask.created_at,
        updated_at: remoteTask.updated_at,
        deleted_at: remoteTask.deleted_at,
      }

      await this.db.upsertTask(task)
    }
  }

  // Create a new task (works offline)
  async createTask(task: Partial<Task>): Promise<Task> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('No authenticated user')

    const newTask: Task = {
      id: `local_${Date.now()}`,
      local_id: `local_${Date.now()}`,
      user_id: user.id,
      name: task.name || 'New Task',
      status: task.status || 'pending',
      priority: task.priority || 'medium',
      sync_status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...task,
    }

    await this.db.upsertTask(newTask)
    
    // Try to sync immediately if online
    await this.sync()

    return newTask
  }

  // Update a task (works offline)
  async updateTask(localId: string, updates: Partial<Task>): Promise<void> {
    const task = await this.db.getTask(localId)
    if (!task) throw new Error('Task not found')

    const updatedTask: Task = {
      ...task,
      ...updates,
      sync_status: 'pending',
      updated_at: new Date().toISOString(),
    }

    await this.db.upsertTask(updatedTask)
    
    // Try to sync immediately if online
    await this.sync()
  }

  // Delete a task (soft delete, works offline)
  async deleteTask(localId: string): Promise<void> {
    await this.db.deleteTask(localId)
    
    // Try to sync immediately if online
    await this.sync()
  }

  // Get all tasks
  async getTasks(): Promise<Task[]> {
    return this.db.getTasks()
  }

  // Get active tasks (not deleted)
  async getActiveTasks(): Promise<Task[]> {
    const tasks = await this.db.getTasks()
    return tasks.filter(t => !t.deleted_at)
  }
}