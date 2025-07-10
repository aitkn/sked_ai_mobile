import { TaskMonitor } from './src/task-monitor.js'
import { SolutionGenerator } from './src/solution-generator.js'
import { TimelineGenerator } from './src/timeline-generator.js'

const SUPABASE_URL = 'https://jfcurpgmlzlceotuthat.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpmY3VycGdtbHpsY2VvdHV0aGF0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyODc5ODg4OSwiZXhwIjoyMDQ0Mzc0ODg5fQ.zDuMjKEMOt-vI41b_AS_8_jaTyoSndE2nSepQsQXiHU'

async function testFullDeduplication() {
  console.log('🧪 Testing Full Deduplication Pipeline')
  console.log('======================================')

  try {
    const taskMonitor = new TaskMonitor(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const solutionGenerator = new SolutionGenerator(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const timelineGenerator = new TimelineGenerator(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    
    // Mock the same task that would cause duplicates (use unique ID)
    const uniqueId = `test-duplicate-task-${Date.now()}`
    const mockTask = {
      task_id: uniqueId,
      user_id: '280ee21e-0e80-4b61-b58e-c62558e729d9',
      name: 'Duplicate Test Task ' + uniqueId,
      definition: {},
      created_at: new Date().toISOString()
    }

    console.log('🔄 Testing Task Monitor Deduplication...')
    
    // Test 1: Task Monitor should prevent duplicate processing
    let processCount = 0
    const mockHandler = async (task) => {
      processCount++
      console.log(`📋 Handler called for: ${task.name} (count: ${processCount})`)
      
      // Simulate the full pipeline
      console.log('🧠 Generating solution...')
      const solutionData = await solutionGenerator.generateSolution(task)
      
      console.log('📅 Generating timeline...')
      const timelineData = await timelineGenerator.generateTimeline(solutionData)
      
      console.log(`✅ Pipeline completed for: ${task.name}`)
    }

    // Set up task monitor with our handler
    taskMonitor.startMonitoring(mockHandler, () => {})

    console.log('\n🔄 First processing (should work)...')
    await taskMonitor.processNewTask(mockTask)
    
    console.log('\n🔄 Second processing (should be blocked by in-memory)...')
    await taskMonitor.processNewTask(mockTask)
    
    // Wait for first pipeline to complete and save to database
    console.log('\n⏱️ Waiting for pipeline to complete and save to database...')
    await new Promise(resolve => setTimeout(resolve, 3000))
    
    // Clear in-memory cache to test database deduplication
    console.log('\n🧹 Clearing in-memory cache to test database deduplication...')
    taskMonitor.processedTasks.clear()
    
    console.log('\n🔄 Third processing (should be blocked by database)...')
    await taskMonitor.processNewTask(mockTask)

    console.log(`\n📊 Results:`)
    console.log(`   Total handler calls: ${processCount} (should be 1)`)
    
    if (processCount === 1) {
      console.log('✅ Full deduplication working correctly!')
    } else {
      console.log('❌ Deduplication failed - multiple processing occurred')
    }

  } catch (error) {
    console.error('\n❌ Test failed:', error.message)
    console.error(error.stack)
  }
}

testFullDeduplication()