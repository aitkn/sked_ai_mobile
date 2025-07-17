import { createClient } from '@supabase/supabase-js'
import { DATABASE_CONFIG } from '../config/globals.js'

export class TaskMonitor {
  constructor(supabaseUrl, supabaseKey) {
    this.supabase = createClient(supabaseUrl, supabaseKey)
    this.isMonitoring = false
    this.processedTasks = new Set() // Track processed tasks to avoid duplicates
    this.onTaskCreated = null // Callback function
  }

  /**
   * Start monitoring for new tasks
   * @param {Function} callback - Function to call when new task is detected
   */
  async startMonitoring(callback) {
    this.onTaskCreated = callback
    this.isMonitoring = true

    console.log('🔍 Starting task monitoring...')

    // Method 1: Realtime subscription for immediate detection
    this.setupRealtimeSubscription()

    // Method 2: Periodic polling as backup (every 30 seconds)
    this.setupPeriodicPolling()

    console.log('✅ Task monitoring active')
  }

  setupRealtimeSubscription() {
    const channel = this.supabase
      .channel('task-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: DATABASE_CONFIG.SCHEMA,
          table: DATABASE_CONFIG.TABLES.TASK
        },
        (payload) => {
          console.log('📥 New task detected via realtime:', payload.new.name)
          this.processNewTask(payload.new)
        }
      )
      .subscribe()

    console.log('📡 Realtime subscription active for task insertions')
  }

  setupPeriodicPolling() {
    setInterval(async () => {
      if (!this.isMonitoring) return

      try {
        await this.pollForNewTasks()
      } catch (error) {
        console.error('❌ Error during periodic polling:', error)
      }
    }, 30000) // Poll every 30 seconds

    console.log('⏰ Periodic polling setup (30s intervals)')
  }

  async pollForNewTasks() {
    try {
      // Get tasks created in the last 2 minutes that haven't been processed
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()
      
      const { data: recentTasks, error } = await this.supabase
        .from(DATABASE_CONFIG.TABLES.TASK)
        .select('*')
        .gte('created_at', twoMinutesAgo)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('❌ Error fetching recent tasks:', error)
        return
      }

      // Process any unprocessed tasks
      for (const task of recentTasks || []) {
        if (!this.processedTasks.has(task.task_id)) {
          console.log('📥 New task detected via polling:', task.name)
          this.processNewTask(task)
        }
      }
    } catch (error) {
      console.error('❌ Error in pollForNewTasks:', error)
    }
  }

  processNewTask(task) {
    // Avoid processing the same task multiple times
    if (this.processedTasks.has(task.task_id)) {
      return
    }

    this.processedTasks.add(task.task_id)
    
    // Log task details
    console.log(`🆕 Processing new task:`, {
      id: task.task_id,
      name: task.name,
      user_id: task.user_id,
      created_at: task.created_at
    })

    // Call the callback function if set
    if (this.onTaskCreated) {
      this.onTaskCreated(task)
    }
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    this.isMonitoring = false
    console.log('🛑 Task monitoring stopped')
  }

  /**
   * Get monitoring status
   */
  getStatus() {
    return {
      isMonitoring: this.isMonitoring,
      processedTasksCount: this.processedTasks.size
    }
  }
}