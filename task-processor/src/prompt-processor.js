import { createClient } from '@supabase/supabase-js'
import { DATABASE_CONFIG } from '../config/globals.js'

export class PromptProcessor {
  constructor(supabaseUrl, supabaseKey) {
    this.supabase = createClient(supabaseUrl, supabaseKey)
  }

  /**
   * Process a user prompt and convert it to tasks
   */
  async processPrompt(prompt) {
    console.log(`🧠 Processing prompt: "${prompt.prompt_text?.substring(0, 50)}..."`)

    try {
      // Parse the prompt to extract task information
      const taskData = this.parsePromptToTask(prompt)

      // Create task in database
      const task = await this.createTaskFromPrompt(taskData, prompt.user_id)

      console.log(`✅ Task created from prompt: "${task.name}"`)
      
      return {
        success: true,
        task: task,
        promptId: prompt.user_prompt_id
      }
    } catch (error) {
      console.error('❌ Error processing prompt:', error)
      return {
        success: false,
        error: error.message,
        promptId: prompt.user_prompt_id
      }
    }
  }

  /**
   * Parse prompt text to extract task information
   */
  parsePromptToTask(prompt) {
    const text = prompt.prompt_text || ''
    
    // Simple parsing logic - extract duration and activity
    const durationMatch = text.match(/(\d+)\s*(minutes?|mins?|hours?|hrs?)/i)
    let durationMinutes = 30 // Default duration

    if (durationMatch) {
      const value = parseInt(durationMatch[1])
      const unit = durationMatch[2].toLowerCase()
      
      if (unit.includes('hour') || unit.includes('hr')) {
        durationMinutes = value * 60
      } else {
        durationMinutes = value
      }
    }

    // Extract the main activity (remove duration mentions)
    let name = text.replace(/(\d+\s*(minutes?|mins?|hours?|hrs?))/gi, '').trim()
    
    // Clean up common words
    name = name.replace(/^(do|perform|complete|finish|work on|start)\s+/i, '').trim()
    name = name.replace(/\s+(for|during)\s*$/i, '').trim()
    
    // Capitalize first letter
    if (name) {
      name = name.charAt(0).toUpperCase() + name.slice(1)
    } else {
      name = 'Task from prompt'
    }

    // Add duration to name if it doesn't already contain it
    if (!name.includes('minute') && !name.includes('hour')) {
      if (durationMinutes >= 60) {
        const hours = Math.floor(durationMinutes / 60)
        const mins = durationMinutes % 60
        if (mins > 0) {
          name += ` for ${hours}h ${mins}m`
        } else {
          name += ` for ${hours} hour${hours > 1 ? 's' : ''}`
        }
      } else {
        name += ` for ${durationMinutes} minutes`
      }
    }

    return {
      name: name,
      definition: {
        original_prompt: text,
        parsed_duration_minutes: durationMinutes,
        created_from_prompt: true,
        prompt_id: prompt.user_prompt_id
      }
    }
  }

  /**
   * Create a task in the database from parsed prompt data
   */
  async createTaskFromPrompt(taskData, userId) {
    const { data, error } = await this.supabase
      .schema(DATABASE_CONFIG.SCHEMA)
      .from(DATABASE_CONFIG.TABLES.TASK)
      .insert({
        user_id: userId,
        name: taskData.name,
        definition: taskData.definition
      })
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to create task: ${error.message}`)
    }

    return data
  }
}