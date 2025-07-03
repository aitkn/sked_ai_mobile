import 'dotenv/config'
import { TaskMonitor } from './src/task-monitor.js'
import { SolutionGenerator } from './src/solution-generator.js'
import { TimelineGenerator } from './src/timeline-generator.js'
import { NotificationService } from './src/notification-service.js'
import { RealtimeService } from './src/realtime-service.js'

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
    
    this.isRunning = false
    this.processedTasks = 0
    this.errors = []
    
    // Bind the task handler
    this.handleNewTask = this.handleNewTask.bind(this)
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
      
      // Start task monitoring
      console.log('🔍 Starting task monitoring...')
      await this.taskMonitor.startMonitoring(this.handleNewTask)
      
      this.isRunning = true
      
      console.log('✅ Task Processor is now running!')
      console.log('====================================')
      console.log('Monitoring for new tasks in the database...')
      console.log('Press Ctrl+C to stop')
      
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