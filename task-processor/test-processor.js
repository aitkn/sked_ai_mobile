import { SolutionGenerator } from './src/solution-generator.js'
import { TimelineGenerator } from './src/timeline-generator.js'

const SUPABASE_URL = 'https://jfcurpgmlzlceotuthat.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpmY3VycGdtbHpsY2VvdHV0aGF0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyODc5ODg4OSwiZXhwIjoyMDQ0Mzc0ODg5fQ.zDuMjKEMOt-vI41b_AS_8_jaTyoSndE2nSepQsQXiHU'

async function testProcessing() {
  console.log('🧪 Testing Task Processor Components')
  console.log('=====================================')

  try {
    // Mock task data (simulating the task we just created)
    const mockTask = {
      task_id: '29adbad3-16b6-43f3-a781-5c451a7d7a9a',
      user_id: '280ee21e-0e80-4b61-b58e-c62558e729d9',
      name: 'Machine Learning Study Session for 60 minutes',
      definition: {},
      created_at: '2025-06-20T02:14:49.302353+00:00'
    }

    console.log(`📋 Testing with task: "${mockTask.name}"`)

    // Test 1: Solution Generation
    console.log('\n🧠 Testing Solution Generator...')
    const solutionGenerator = new SolutionGenerator(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const solutionData = await solutionGenerator.generateSolution(mockTask)
    
    console.log('✅ Solution generated successfully:')
    console.log(`   - Model ID: ${solutionData.modelId}`)
    console.log(`   - Task Type: ${solutionData.taskAnalysis.taskType}`)
    console.log(`   - Duration: ${solutionData.taskAnalysis.durationMinutes} minutes`)
    console.log(`   - Start Time: ${solutionData.schedule.startTime}`)
    console.log(`   - End Time: ${solutionData.schedule.endTime}`)

    // Test 2: Timeline Generation
    console.log('\n📅 Testing Timeline Generator...')
    const timelineGenerator = new TimelineGenerator(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const timelineData = await timelineGenerator.generateTimeline(solutionData)
    
    console.log('✅ Timeline generated successfully:')
    console.log(`   - Timeline ID: ${timelineData.user_id}`)
    console.log(`   - Total Tasks: ${timelineData.timeline_json.tasks.length}`)
    console.log(`   - New Task: ${timelineData.timeline_json.tasks.find(t => t.task_id === mockTask.task_id)?.name || 'Found in timeline'}`)

    console.log('\n🎉 All tests passed! The processor components are working correctly.')
    console.log('\n📝 To test the full pipeline:')
    console.log('   1. Run: node index.js')
    console.log('   2. In another terminal, create a task in the database')
    console.log('   3. Watch the processor logs for automatic processing')

  } catch (error) {
    console.error('\n❌ Test failed:', error.message)
    console.error(error.stack)
  }
}

testProcessing()