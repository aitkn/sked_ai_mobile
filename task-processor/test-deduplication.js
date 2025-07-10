import { TaskMonitor } from './src/task-monitor.js'

const SUPABASE_URL = 'https://jfcurpgmlzlceotuthat.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpmY3VycGdtbHpsY2VvdHV0aGF0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyODc5ODg4OSwiZXhwIjoyMDQ0Mzc0ODg5fQ.zDuMjKEMOt-vI41b_AS_8_jaTyoSndE2nSepQsQXiHU'

async function testDeduplication() {
  console.log('🧪 Testing Task Deduplication')
  console.log('==============================')

  try {
    const taskMonitor = new TaskMonitor(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    
    // Mock the same task
    const mockTask = {
      task_id: '29adbad3-16b6-43f3-a781-5c451a7d7a9a', // Same task ID
      user_id: '280ee21e-0e80-4b61-b58e-c62558e729d9',
      name: 'Test Task for Deduplication',
      definition: {},
      created_at: '2025-06-20T02:14:49.302353+00:00'
    }

    let processCount = 0
    
    // Set up callback to count processing attempts
    taskMonitor.startMonitoring(
      (task) => {
        processCount++
        console.log(`📋 Processing attempt #${processCount} for task: ${task.name}`)
      },
      () => {} // Empty prompt handler
    )

    console.log('\n🔄 First processing attempt...')
    await taskMonitor.processNewTask(mockTask)
    
    console.log('\n🔄 Second processing attempt (should be skipped)...')
    await taskMonitor.processNewTask(mockTask)
    
    console.log('\n🔄 Third processing attempt (should be skipped)...')
    await taskMonitor.processNewTask(mockTask)

    console.log(`\n✅ Deduplication test completed!`)
    console.log(`📊 Total processing attempts: ${processCount} (should be 1)`)
    
    if (processCount === 1) {
      console.log('✅ Deduplication working correctly!')
    } else {
      console.log('❌ Deduplication failed - task was processed multiple times')
    }

  } catch (error) {
    console.error('\n❌ Test failed:', error.message)
    console.error(error.stack)
  }
}

testDeduplication()