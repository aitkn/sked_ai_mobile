import 'dotenv/config'
import readline from 'readline'
import { TaskMonitor } from './src/task-monitor.js'
import { SolutionGenerator } from './src/solution-generator.js'
import { TimelineGenerator } from './src/timeline-generator.js'
import { NotificationService } from './src/notification-service.js'
import { RealtimeService } from './src/realtime-service.js'
import { PromptProcessor } from './src/prompt-processor.js'

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jfcurpgmlzlceotuthat.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpmY3VycGdtbHpsY2VvdHV0aGF0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyODc5ODg4OSwiZXhwIjoyMDQ0Mzc0ODg5fQ.zDuMjKEMOt-vI41b_AS_8_jaTyoSndE2nSepQsQXiHU'

class TaskProcessor {
  constructor() {
    // Initialize all services
    this.taskMonitor = new TaskMonitor(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    this.solutionGenerator = new SolutionGenerator(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    this.timelineGenerator = new TimelineGenerator(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    this.notificationService = new NotificationService(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    this.realtimeService = new RealtimeService(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    this.promptProcessor = new PromptProcessor(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    
    this.isRunning = false
    this.processedTasks = 0
    this.processedPrompts = 0
    this.errors = []
    
    // Bind the handlers
    this.handleNewTask = this.handleNewTask.bind(this)
    this.handleNewPrompt = this.handleNewPrompt.bind(this)
  }

  /**
   * Start the task processor
   */
  async start() {
    console.log('🚀 Starting SkedAI Task Processor...')
    console.log('====================================')
    
    try {
      // Initialize realtime service
      console.log('📡 Initializing realtime service...')
      await this.realtimeService.initialize()
      
      // Start task and prompt monitoring
      console.log('🔍 Starting task monitoring...')
      await this.taskMonitor.startMonitoring(this.handleNewTask, this.handleNewPrompt)
      
      this.isRunning = true
      
      console.log('✅ Task Processor is now running!')
      console.log('====================================')
      console.log('Monitoring for new tasks and prompts in the database...')
      console.log('')
      console.log('💡 Available commands: clear, status, help, exit')
      console.log('💡 Type "help" for more information')
      console.log('')
      
      // Setup interactive CLI
      this.setupInteractiveCLI()
      
      // Setup status reporting
      this.setupStatusReporting()
      
      // Setup graceful shutdown
      this.setupGracefulShutdown()
      
    } catch (error) {
      console.error('❌ Failed to start task processor:', error)
      process.exit(1)
    }
  }

  /**
   * Handle new task detection
   */
  async handleNewTask(task) {
    const startTime = Date.now()
    console.log('')
    console.log('🆕 ================================')
    console.log(`🆕 PROCESSING NEW TASK: ${task.name}`)
    console.log('🆕 ================================')
    
    try {
      // Step 1: Broadcast processing started
      await this.realtimeService.broadcastProcessingStatus(
        task.task_id, 
        task.user_id, 
        'started', 
        'initializing'
      )

      // Step 2: Generate solution
      console.log('🧠 Step 1: Generating AI solution...')
      await this.realtimeService.broadcastProcessingStatus(
        task.task_id, 
        task.user_id, 
        'processing', 
        'solution_generation'
      )
      
      const solutionData = await this.solutionGenerator.generateSolution(task)
      console.log(`✅ Solution generated (model_id: ${solutionData.modelId})`)

      // Step 3: Generate timeline
      console.log('📅 Step 2: Creating user timeline...')
      await this.realtimeService.broadcastProcessingStatus(
        task.task_id, 
        task.user_id, 
        'processing', 
        'timeline_creation'
      )
      
      const timelineData = await this.timelineGenerator.generateTimeline(solutionData)
      console.log(`✅ Timeline created with ${timelineData.timeline_json.tasks.length} tasks`)

      // Step 4: Handle notifications
      console.log('📬 Step 3: Processing notifications...')
      await this.realtimeService.broadcastProcessingStatus(
        task.task_id, 
        task.user_id, 
        'processing', 
        'notification_sending'
      )
      
      await this.notificationService.handleTimelineUpdate(timelineData, solutionData.taskAnalysis)
      
      // Step 5: Broadcast via realtime
      await this.realtimeService.broadcastTimelineUpdate(task.user_id, timelineData)

      // Step 6: Mark as completed
      await this.realtimeService.broadcastProcessingStatus(
        task.task_id, 
        task.user_id, 
        'completed'
      )

      this.processedTasks++
      const processingTime = Date.now() - startTime
      
      console.log('✅ ================================')
      console.log('✅ TASK PROCESSING COMPLETED!')
      console.log(`✅ Time taken: ${processingTime}ms`)
      console.log(`✅ Total tasks processed: ${this.processedTasks}`)
      console.log('✅ ================================')
      
    } catch (error) {
      console.error('❌ ================================')
      console.error('❌ TASK PROCESSING FAILED!')
      console.error(`❌ Task: ${task.name}`)
      console.error(`❌ Error: ${error.message}`)
      console.error('❌ ================================')
      
      // Broadcast error status
      await this.realtimeService.broadcastProcessingStatus(
        task.task_id, 
        task.user_id, 
        'error', 
        error.message
      )
      
      this.errors.push({
        task_id: task.task_id,
        task_name: task.name,
        error: error.message,
        timestamp: new Date().toISOString()
      })
    }
  }

  /**
   * Handle new prompt detection
   */
  async handleNewPrompt(prompt) {
    const startTime = Date.now()
    console.log('')
    console.log('💬 ================================')
    console.log(`💬 PROCESSING NEW PROMPT: "${prompt.prompt_text?.substring(0, 50)}..."`)
    console.log('💬 ================================')
    
    try {
      // Step 1: Process prompt into task
      console.log('🧠 Converting prompt to task...')
      const result = await this.promptProcessor.processPrompt(prompt)
      
      if (result.success) {
        console.log(`✅ Task created: "${result.task.name}"`)
        
        // Step 2: Mark prompt as processed
        const marked = await this.taskMonitor.markPromptAsProcessed(result.promptId)
        if (marked) {
          console.log('✅ Prompt marked as processed')
        }
        
        // Step 3: Process the newly created task
        console.log('🔄 Processing generated task...')
        await this.handleNewTask(result.task)
        
        this.processedPrompts++
        const processingTime = Date.now() - startTime
        
        console.log('✅ ================================')
        console.log('✅ PROMPT PROCESSING COMPLETED!')
        console.log(`✅ Time taken: ${processingTime}ms`)
        console.log(`✅ Total prompts processed: ${this.processedPrompts}`)
        console.log('✅ ================================')
        
      } else {
        throw new Error(result.error)
      }
      
    } catch (error) {
      console.error('❌ ================================')
      console.error('❌ PROMPT PROCESSING FAILED!')
      console.error(`❌ Prompt: "${prompt.prompt_text?.substring(0, 50)}..."`)
      console.error(`❌ Error: ${error.message}`)
      console.error('❌ ================================')
      
      this.errors.push({
        prompt_id: prompt.user_prompt_id,
        prompt_text: prompt.prompt_text,
        error: error.message,
        timestamp: new Date().toISOString()
      })
    }
  }

  /**
   * Setup periodic status reporting
   */
  setupStatusReporting() {
    setInterval(() => {
      if (this.isRunning) {
        const status = this.getStatus()
        console.log('')
        console.log('📊 ================================')
        console.log('📊 TASK PROCESSOR STATUS')
        console.log('📊 ================================')
        console.log(`📊 Running: ${status.isRunning}`)
        console.log(`📊 Tasks Processed: ${status.processedTasks}`)
        console.log(`📊 Prompts Processed: ${status.processedPrompts}`)
        console.log(`📊 Errors: ${status.errorCount}`)
        console.log(`📊 Uptime: ${status.uptimeMinutes} minutes`)
        console.log('📊 ================================')
      }
    }, 5 * 60 * 1000) // Every 5 minutes
  }

  /**
   * Setup graceful shutdown
   */
  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      console.log('')
      console.log(`🛑 Received ${signal}, shutting down gracefully...`)
      
      this.isRunning = false
      
      // Stop monitoring
      this.taskMonitor.stopMonitoring()
      
      // Disconnect realtime
      await this.realtimeService.disconnect()
      
      console.log('✅ Task processor shutdown complete')
      process.exit(0)
    }

    process.on('SIGINT', () => shutdown('SIGINT'))
    process.on('SIGTERM', () => shutdown('SIGTERM'))
  }

  /**
   * Get processor status
   */
  getStatus() {
    const uptime = process.uptime()
    
    return {
      isRunning: this.isRunning,
      processedTasks: this.processedTasks,
      processedPrompts: this.processedPrompts,
      errorCount: this.errors.length,
      uptimeSeconds: uptime,
      uptimeMinutes: Math.floor(uptime / 60),
      taskMonitor: this.taskMonitor.getStatus(),
      notificationService: this.notificationService.getStatus(),
      realtimeService: this.realtimeService.getStatus(),
      recentErrors: this.errors.slice(-5) // Last 5 errors
    }
  }

  /**
   * Send test notification
   */
  async sendTestNotification(userId) {
    console.log(`🧪 Sending test notification to user ${userId}`)
    const result = await this.notificationService.sendTestNotification(userId)
    console.log(`🧪 Test notification result: ${result}`)
    return result
  }

  /**
   * Clear all tasks and timelines from database
   */
  async clearAllData() {
    console.log('')
    console.log('🧹 ================================')
    console.log('🧹 CLEARING ALL DATA...')
    console.log('🧹 ================================')
    
    try {
      const startTime = Date.now()
      
      // Clear in the correct order to handle foreign key constraints
      
      // 1. Clear user_timeline table first (no dependencies)
      console.log('🧹 Clearing user_timeline table...')
      const { error: timelineError } = await this.taskMonitor.supabase
        .schema('skedai')
        .from('user_timeline')
        .delete()
        .not('user_id', 'is', null) // Delete all rows with non-null user_id
      
      if (timelineError) {
        console.error('❌ Error clearing user_timeline:', timelineError.message)
      } else {
        console.log('✅ user_timeline table cleared')
      }

      // 2. Clear solution_score table before task (foreign key dependency)
      console.log('🧹 Clearing solution_score table...')
      const { error: solutionError } = await this.taskMonitor.supabase
        .schema('skedai')
        .from('solution_score')
        .delete()
        .not('model_id', 'is', null) // Delete all rows with non-null model_id
      
      if (solutionError) {
        console.error('❌ Error clearing solution_score:', solutionError.message)
      } else {
        console.log('✅ solution_score table cleared')
      }

      // 3. Clear task_tag table before task (foreign key dependency)
      console.log('🧹 Clearing task_tag table...')
      const { error: taskTagError } = await this.taskMonitor.supabase
        .schema('skedai')
        .from('task_tag')
        .delete()
        .not('task_id', 'is', null) // Delete all rows with non-null task_id
      
      if (taskTagError) {
        console.error('❌ Error clearing task_tag:', taskTagError.message)
      } else {
        console.log('✅ task_tag table cleared')
      }

      // 4. Clear task table after dependencies
      console.log('🧹 Clearing task table...')
      const { error: taskError } = await this.taskMonitor.supabase
        .schema('skedai')
        .from('task')
        .delete()
        .not('task_id', 'is', null) // Delete all rows with non-null task_id
      
      if (taskError) {
        console.error('❌ Error clearing task:', taskError.message)
      } else {
        console.log('✅ task table cleared')
      }

      // 5. Clear user_prompt table
      console.log('🧹 Clearing user_prompt table...')
      const { error: promptError } = await this.taskMonitor.supabase
        .schema('skedai')
        .from('user_prompt')
        .delete()
        .not('user_id', 'is', null) // Delete all rows with non-null user_id
      
      if (promptError) {
        console.error('❌ Error clearing user_prompt:', promptError.message)
      } else {
        console.log('✅ user_prompt table cleared')
      }

      // Reset processor statistics
      this.processedTasks = 0
      this.processedPrompts = 0
      this.errors = []
      
      const clearTime = Date.now() - startTime
      
      console.log('✅ ================================')
      console.log('✅ ALL DATA CLEARED SUCCESSFULLY!')
      console.log(`✅ Time taken: ${clearTime}ms`)
      console.log('✅ Processor statistics reset')
      console.log('✅ ================================')
      
    } catch (error) {
      console.error('❌ ================================')
      console.error('❌ FAILED TO CLEAR DATA!')
      console.error(`❌ Error: ${error.message}`)
      console.error('❌ ================================')
    }
  }

  /**
   * Setup interactive CLI commands
   */
  setupInteractiveCLI() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: ''
    })

    rl.on('line', async (input) => {
      const command = input.trim().toLowerCase()
      
      switch (command) {
        case 'clear':
          await this.clearAllData()
          break
          
        case 'status':
          const status = this.getStatus()
          console.log('')
          console.log('📊 ================================')
          console.log('📊 CURRENT STATUS')
          console.log('📊 ================================')
          console.log(`📊 Running: ${status.isRunning}`)
          console.log(`📊 Tasks Processed: ${status.processedTasks}`)
          console.log(`📊 Prompts Processed: ${status.processedPrompts}`)
          console.log(`📊 Errors: ${status.errorCount}`)
          console.log(`📊 Uptime: ${status.uptimeMinutes} minutes`)
          if (status.recentErrors.length > 0) {
            console.log('📊 Recent Errors:')
            status.recentErrors.forEach((error, i) => {
              console.log(`📊   ${i+1}. ${error.error} (${error.timestamp})`)
            })
          }
          console.log('📊 ================================')
          break
          
        case 'help':
          console.log('')
          console.log('💡 ================================')
          console.log('💡 AVAILABLE COMMANDS')
          console.log('💡 ================================')
          console.log('💡 clear      - Clear all tasks and timelines')
          console.log('💡 status     - Show current processor status')
          console.log('💡 diagnose   - Show detailed connection diagnostics')
          console.log('💡 reconnect  - Force reconnection of all channels')
          console.log('💡 help       - Show this help message')
          console.log('💡 exit       - Shutdown the processor')
          console.log('💡 ================================')
          break
          
        case 'diagnose':
          console.log('')
          console.log('🔍 ================================')
          console.log('🔍 CONNECTION DIAGNOSTICS')
          console.log('🔍 ================================')
          
          const diagnostics = this.realtimeService.getConnectionDiagnostics()
          console.log(`📊 Total Channels: ${diagnostics.totalChannels}`)
          console.log(`✅ Connected: ${diagnostics.connectedChannels}`)
          console.log(`❌ Disconnected: ${diagnostics.totalChannels - diagnostics.connectedChannels}`)
          console.log(`🔄 Connection Attempts: ${diagnostics.connectionAttempts}/${diagnostics.maxRetries}`)
          
          console.log('\n📡 Channel Details:')
          for (const [channelName, channelInfo] of Object.entries(diagnostics.channels)) {
            const status = channelInfo.connected ? '✅' : '❌'
            console.log(`${status} ${channelName}: ${channelInfo.state}`)
          }
          
          console.log('\n💡 Troubleshooting Tips:')
          if (diagnostics.connectedChannels === 0) {
            console.log('💡 No channels connected - check network and Supabase credentials')
            console.log('💡 Try: reconnect')
          } else if (diagnostics.connectedChannels < diagnostics.totalChannels) {
            console.log('💡 Partial connection - some channels failing')
            console.log('💡 Try: reconnect')
          } else {
            console.log('💡 All channels connected - system healthy')
          }
          console.log('🔍 ================================')
          break

        case 'reconnect':
          console.log('')
          console.log('🔄 ================================')
          console.log('🔄 FORCING RECONNECTION')
          console.log('🔄 ================================')
          
          try {
            await this.realtimeService.reconnectChannels()
            console.log('✅ Reconnection attempt completed')
            
            // Check status after reconnection
            setTimeout(() => {
              const postDiagnostics = this.realtimeService.getConnectionDiagnostics()
              console.log(`📊 Status: ${postDiagnostics.connectedChannels}/${postDiagnostics.totalChannels} channels connected`)
            }, 3000)
            
          } catch (error) {
            console.error('❌ Reconnection failed:', error.message)
          }
          console.log('🔄 ================================')
          break

        case 'exit':
          console.log('🛑 Shutting down...')
          rl.close()
          process.exit(0)
          break
          
        case '':
          // Empty command, do nothing
          break
          
        default:
          console.log(`❓ Unknown command: "${command}". Type "help" for available commands.`)
          break
      }
    })

    // Handle Ctrl+C gracefully
    rl.on('SIGINT', () => {
      console.log('\n🛑 Shutting down...')
      rl.close()
      process.exit(0)
    })
  }
}

// Create and start the processor
const processor = new TaskProcessor()

// Handle command line arguments
const args = process.argv.slice(2)
if (args.includes('--test-notification')) {
  const userId = args[args.indexOf('--test-notification') + 1] || '280ee21e-0e80-4b61-b58e-c62558e729d9'
  processor.sendTestNotification(userId).then(() => {
    console.log('Test notification sent, exiting...')
    process.exit(0)
  })
} else {
  // Normal startup
  processor.start().catch(error => {
    console.error('❌ Failed to start processor:', error)
    process.exit(1)
  })
}

// Export for testing
export default processor