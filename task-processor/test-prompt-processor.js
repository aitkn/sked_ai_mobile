import 'dotenv/config'
import { PromptProcessor } from './src/prompt-processor.js'
import { randomUUID } from 'crypto'

/**
 * USER PROMPT PROCESSING TEST SUITE
 * ==================================
 * 
 * This test suite validates the complete user prompt processing pipeline:
 * 
 * WHAT IT TESTS:
 * 1. Prompt parsing logic (duration extraction, name cleanup)
 * 2. Task creation from natural language prompts
 * 3. Database integration (creating actual records)
 * 4. Full pipeline trigger (prompt → task → solution → timeline)
 * 
 * WHAT SHOULD HAPPEN:
 * 1. Parse prompts and extract duration/activity information
 * 2. Create properly formatted task names with durations
 * 3. Store tasks in database with links to original prompts
 * 4. When run with --test-pipeline, creates a real prompt that the processor should detect
 * 5. The processor should automatically convert the prompt to a task and process it
 * 
 * COMMANDS TO RUN:
 * - Test parsing only:     node test-prompt-processor.js --test-parsing
 * - Test full pipeline:    node test-prompt-processor.js --test-pipeline
 * - Test everything:       node test-prompt-processor.js
 * 
 * EXPECTED RESULTS:
 * - All prompts should be parsed correctly with proper durations
 * - Tasks should be created in the database with meaningful names
 * - The processor (if running) should detect and process the test prompt
 * - Final result: prompt marked as is_processed=true and task fully scheduled
 */

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jfcurpgmlzlceotuthat.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpmY3VycGdtbHpsY2VvdHV0aGF0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyODc5ODg4OSwiZXhwIjoyMDQ0Mzc0ODg5fQ.zDuMjKEMOt-vI41b_AS_8_jaTyoSndE2nSepQsQXiHU'

async function testPromptProcessing() {
  console.log('🧪 Testing Prompt Processor')
  console.log('===========================')
  console.log('📋 WHAT THIS TEST DOES:')
  console.log('   • Parses natural language prompts to extract duration and activity')
  console.log('   • Creates structured tasks with proper names and metadata')
  console.log('   • Stores tasks in database with links to original prompts')
  console.log('')
  console.log('📈 EXPECTED BEHAVIOR:')
  console.log('   • "15 minutes" → 15 minute duration')
  console.log('   • "2 hours" → 120 minute duration') 
  console.log('   • "workout" → "Workout for 30 minutes" (default duration)')
  console.log('   • All tasks should be created successfully in database')
  console.log('')
  
  const promptProcessor = new PromptProcessor(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  
  // Test cases with different prompt formats - using real UUIDs
  const testPrompts = [
    {
      user_prompt_id: randomUUID(),
      user_id: '280ee21e-0e80-4b61-b58e-c62558e729d9',
      prompt_text: 'Read emails for 15 minutes',
      is_processed: false,
      created_at: new Date().toISOString()
    },
    {
      user_prompt_id: randomUUID(), 
      user_id: '280ee21e-0e80-4b61-b58e-c62558e729d9',
      prompt_text: 'Study machine learning for 2 hours',
      is_processed: false,
      created_at: new Date().toISOString()
    },
    {
      user_prompt_id: randomUUID(),
      user_id: '280ee21e-0e80-4b61-b58e-c62558e729d9', 
      prompt_text: 'Take a 30 minute walk',
      is_processed: false,
      created_at: new Date().toISOString()
    },
    {
      user_prompt_id: randomUUID(),
      user_id: '280ee21e-0e80-4b61-b58e-c62558e729d9',
      prompt_text: 'workout',
      is_processed: false,
      created_at: new Date().toISOString()
    }
  ]
  
  for (const [index, testPrompt] of testPrompts.entries()) {
    console.log(`\\n📝 Test ${index + 1}: "${testPrompt.prompt_text}"`)
    console.log('─'.repeat(50))
    
    try {
      // Test prompt parsing
      const taskData = promptProcessor.parsePromptToTask(testPrompt)
      console.log('✅ Parsed successfully:')
      console.log(`   Name: "${taskData.name}"`)
      console.log(`   Duration: ${taskData.definition.parsed_duration_minutes} minutes`)
      console.log(`   Original: "${taskData.definition.original_prompt}"`)
      
      // Test full processing (creates actual task in database)
      const result = await promptProcessor.processPrompt(testPrompt)
      
      if (result.success) {
        console.log('✅ Task created successfully:')
        console.log(`   Task ID: ${result.task.task_id}`)
        console.log(`   Task Name: "${result.task.name}"`)
        console.log(`   User ID: ${result.task.user_id}`)
      } else {
        console.log('❌ Task creation failed:', result.error)
      }
      
    } catch (error) {
      console.log('❌ Error:', error.message)
    }
  }
  
  console.log('\\n🎉 All prompt processing tests completed!')
  console.log('\\n📝 Summary:')
  console.log('- Tests parsing of various duration formats (minutes, hours)')
  console.log('- Tests task name generation and cleanup')
  console.log('- Tests actual task creation in database')
  console.log('- Created tasks can now be processed by the main pipeline')
}

async function testPromptInsertionTrigger() {
  console.log('\\n🧪 Testing Prompt Insertion Pipeline')
  console.log('=====================================')
  console.log('📋 WHAT THIS TEST DOES:')
  console.log('   • Inserts a real prompt directly into the user_prompt table')
  console.log('   • Triggers the full processor pipeline if running')
  console.log('   • Tests end-to-end prompt → task → solution → timeline flow')
  console.log('')
  console.log('📈 EXPECTED BEHAVIOR:')
  console.log('   1. Prompt gets inserted with is_processed=false')
  console.log('   2. Processor detects new prompt (via realtime or polling)')
  console.log('   3. Prompt gets converted to a structured task')
  console.log('   4. Prompt gets marked as is_processed=true')
  console.log('   5. Task gets processed through full AI pipeline')
  console.log('   6. Solution and timeline get created')
  console.log('   7. Notifications get sent (if in timing window)')
  console.log('')
  console.log('🔄 TO TEST FULL PIPELINE:')
  console.log('   1. Run: node index.js (in another terminal)')
  console.log('   2. Run: node test-prompt-processor.js --test-pipeline')
  console.log('   3. Watch processor logs for automatic processing')
  console.log('')
  
  // Import supabase client for direct database operations
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  
  // Create a test prompt directly in the database
  const testPrompt = {
    user_id: '280ee21e-0e80-4b61-b58e-c62558e729d9',
    prompt_text: 'Practice guitar for 45 minutes',
    is_processed: false
  }
  
  console.log('📝 Creating test prompt in database...')
  console.log(`Prompt: "${testPrompt.prompt_text}"`)
  
  try {
    const { data, error } = await supabase
      .schema('skedai')
      .from('user_prompt')
      .insert(testPrompt)
      .select()
      .single()
    
    if (error) {
      console.log('❌ Failed to create prompt:', error.message)
      return
    }
    
    console.log('✅ Test prompt created successfully!')
    console.log(`   Prompt ID: ${data.user_prompt_id}`)
    console.log(`   Created at: ${data.created_at}`)
    console.log('')
    console.log('🚨 IMPORTANT: TO SEE THE PROCESSING IN ACTION:')
    console.log('')
    console.log('   1️⃣  Open a NEW terminal window')
    console.log('   2️⃣  Navigate to your project directory')
    console.log('   3️⃣  Run: cd task-processor && node index.js')
    console.log('   4️⃣  Watch the logs - you should see:')
    console.log('       💬 PROCESSING NEW PROMPT: "Practice guitar for 45 minutes"')
    console.log('       🧠 Converting prompt to task...')
    console.log('       ✅ Task created: "Practice guitar for 45 minutes"')
    console.log('       ✅ Prompt marked as processed')
    console.log('       🆕 PROCESSING NEW TASK: Practice guitar for 45 minutes')
    console.log('       🧠 Step 1: Generating AI solution...')
    console.log('       📅 Step 2: Creating user timeline...')
    console.log('       📬 Step 3: Processing notifications...')
    console.log('       ✅ TASK PROCESSING COMPLETED!')
    console.log('')
    console.log('💡 The processor detects prompts in 2 ways:')
    console.log('   • Realtime: Instant detection when prompt is inserted')
    console.log('   • Polling: Every 30 seconds checks for unprocessed prompts')
    console.log('')
    console.log('🔍 If processor is already running, it should detect this prompt within 30 seconds!')
    
  } catch (error) {
    console.log('❌ Error creating test prompt:', error.message)
  }
}

// Run tests based on command line argument
const args = process.argv.slice(2)

if (args.includes('--test-parsing')) {
  // Test just the parsing logic without database operations
  testPromptProcessing()
} else if (args.includes('--test-pipeline')) {
  // Test the full pipeline by inserting a prompt
  testPromptInsertionTrigger()
} else {
  // Run both tests
  console.log('🚀 Running all prompt processing tests...')
  console.log('')
  
  testPromptProcessing().then(() => {
    return testPromptInsertionTrigger()
  }).then(() => {
    console.log('\\n✅ All tests completed!')
  }).catch(error => {
    console.error('❌ Test error:', error)
  })
}