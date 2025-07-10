import { createClient } from '@supabase/supabase-js'
import { DATABASE_CONFIG } from '../config/globals.js'

export class TaskMonitor {
  constructor(supabaseUrl, supabaseKey) {
    this.supabase = createClient(supabaseUrl, supabaseKey)
    this.isMonitoring = false
    this.processedTasks = new Set() // Track processed tasks to avoid duplicates
    this.processedPrompts = new Set() // Track processed prompts to avoid duplicates
    this.onTaskCreated = null // Callback function
    this.onPromptCreated = null // Callback function for prompts
  }

  /**
   * Start monitoring for new tasks and prompts
   * @param {Function} taskCallback - Function to call when new task is detected
   * @param {Function} promptCallback - Function to call when new prompt is detected
   */
  async startMonitoring(taskCallback, promptCallback = null) {
    this.onTaskCreated = taskCallback
    this.onPromptCreated = promptCallback
    this.isMonitoring = true

    console.log('🔍 Starting task monitoring...')

    // Monitor both tasks and prompts
    this.setupRealtimeSubscription()
    if (promptCallback) {
      this.setupPromptSubscription()
      
      // Process any existing unprocessed prompts immediately on startup
      console.log('🔍 Checking for existing unprocessed prompts...')
      await this.pollForNewPrompts()
    }

    // Periodic polling as backup (every 30 seconds)
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
        async (payload) => {
          console.log('📥 New task detected via realtime:', payload.new.name)
          await this.processNewTask(payload.new)
        }
      )
      .subscribe()

    console.log('📡 Realtime subscription active for task insertions')
  }

  setupPromptSubscription() {
    const channel = this.supabase
      .channel('prompt-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: DATABASE_CONFIG.SCHEMA,
          table: DATABASE_CONFIG.TABLES.USER_PROMPT
        },
        (payload) => {
          console.log('📥 New prompt detected via realtime:', payload.new.prompt_text?.substring(0, 50) + '...')
          this.processNewPrompt(payload.new)
        }
      )
      .subscribe()

    console.log('📡 Realtime subscription active for prompt insertions')
  }

  setupPeriodicPolling() {
    setInterval(async () => {
      if (!this.isMonitoring) return

      try {
        await this.pollForNewTasks()
        if (this.onPromptCreated) {
          await this.pollForNewPrompts()
        }
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
        .schema(DATABASE_CONFIG.SCHEMA)
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
          await this.processNewTask(task)
        }
      }
    } catch (error) {
      console.error('❌ Error in pollForNewTasks:', error)
    }
  }

  async pollForNewPrompts() {
    try {
      // Get unprocessed prompts
      const { data: unprocessedPrompts, error } = await this.supabase
        .schema(DATABASE_CONFIG.SCHEMA)
        .from(DATABASE_CONFIG.TABLES.USER_PROMPT)
        .select('*')
        .eq('is_processed', false)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('❌ Error fetching unprocessed prompts:', error)
        return
      }

      // Process any unprocessed prompts
      for (const prompt of unprocessedPrompts || []) {
        if (!this.processedPrompts.has(prompt.user_prompt_id)) {
          console.log('📥 Unprocessed prompt detected via polling:', prompt.prompt_text?.substring(0, 50) + '...')
          this.processNewPrompt(prompt)
        }
      }
    } catch (error) {
      console.error('❌ Error in pollForNewPrompts:', error)
    }
  }

  async processNewTask(task) {
    // Avoid processing the same task multiple times (in-memory check)
    if (this.processedTasks.has(task.task_id)) {
      console.log(`⚠️ Task already processed (in-memory): ${task.name}`)
      return
    }

    // Check database to see if this task has already been processed
    const alreadyProcessed = await this.isTaskAlreadyProcessed(task.task_id)
    if (alreadyProcessed) {
      console.log(`⚠️ Task already processed (database): ${task.name}`)
      this.processedTasks.add(task.task_id) // Add to in-memory cache to avoid future DB checks
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
   * Check if a task has already been processed by looking for existing timelines
   */
  async isTaskAlreadyProcessed(taskId) {
    try {
      // Use raw SQL to check for the task_id in the timeline_json
      const { data, error } = await this.supabase
        .schema(DATABASE_CONFIG.SCHEMA)
        .from(DATABASE_CONFIG.TABLES.USER_TIMELINE)
        .select('user_id, model_id')
        .filter('timeline_json->>last_updated_task', 'eq', taskId)
        .limit(1)

      if (error) {
        console.error('❌ Error checking if task is processed:', error)
        return false // If we can't check, assume not processed to be safe
      }

      const found = data && data.length > 0
      if (found) {
        console.log(`📄 Found existing timeline for task: ${taskId}`)
      }
      return found
    } catch (error) {
      console.error('❌ Error in isTaskAlreadyProcessed:', error)
      return false
    }
  }

  processNewPrompt(prompt) {
    // Avoid processing the same prompt multiple times
    if (this.processedPrompts.has(prompt.user_prompt_id)) {
      return
    }

    this.processedPrompts.add(prompt.user_prompt_id)
    
    // Log prompt details
    console.log(`🆕 Processing new prompt:`, {
      id: prompt.user_prompt_id,
      text: prompt.prompt_text?.substring(0, 100) + (prompt.prompt_text?.length > 100 ? '...' : ''),
      user_id: prompt.user_id,
      created_at: prompt.created_at
    })

    // Call the callback function if set
    if (this.onPromptCreated) {
      this.onPromptCreated(prompt)
    }
  }

  /**
   * Mark a prompt as processed
   */
  async markPromptAsProcessed(promptId) {
    try {
      const { error } = await this.supabase
        .schema(DATABASE_CONFIG.SCHEMA)
        .from(DATABASE_CONFIG.TABLES.USER_PROMPT)
        .update({ 
          is_processed: true, 
          updated_at: new Date().toISOString() 
        })
        .eq('user_prompt_id', promptId)

      if (error) {
        console.error('❌ Error marking prompt as processed:', error)
        return false
      }

      console.log('✅ Prompt marked as processed:', promptId)
      return true
    } catch (error) {
      console.error('❌ Error in markPromptAsProcessed:', error)
      return false
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