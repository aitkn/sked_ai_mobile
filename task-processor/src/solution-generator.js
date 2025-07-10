import { createClient } from '@supabase/supabase-js'
import { SCHEDULING_CONFIG, DATABASE_CONFIG, getNextInterval } from '../config/globals.js'

export class SolutionGenerator {
  constructor(supabaseUrl, supabaseKey) {
    this.supabase = createClient(supabaseUrl, supabaseKey)
  }

  /**
   * Generate a scheduling solution for a given task
   * @param {Object} task - The task object from the database
   * @returns {Object} Generated solution
   */
  async generateSolution(task) {
    console.log(`🧠 Generating solution for task: ${task.name}`)

    try {
      // Step 1: Analyze task requirements
      const taskAnalysis = this.analyzeTask(task)
      
      // Step 2: Generate optimal scheduling
      const schedule = this.generateOptimalSchedule(taskAnalysis)
      
      // Step 3: Create model record
      const modelId = await this.createModelRecord(task, taskAnalysis)
      
      // Step 4: Save solution to database
      const solution = await this.saveSolution(modelId, schedule, taskAnalysis)
      
      console.log(`✅ Solution generated for task ${task.name} with model_id: ${modelId}`)
      
      return {
        modelId,
        solution,
        schedule,
        taskAnalysis
      }
    } catch (error) {
      console.error(`❌ Error generating solution for task ${task.name}:`, error)
      throw error
    }
  }

  /**
   * Analyze task to determine scheduling requirements
   */
  analyzeTask(task) {
    // Mock AI analysis - extract information from task
    const name = task.name.toLowerCase()
    const definition = task.definition || {}
    
    // Determine duration (default 30 minutes)
    let durationMinutes = 30
    
    // Extract duration from task name or definition
    const durationMatch = task.name.match(/(\d+)\s*(min|minute|minutes|hour|hours|hr)/i)
    if (durationMatch) {
      const num = parseInt(durationMatch[1])
      const unit = durationMatch[2].toLowerCase()
      durationMinutes = unit.startsWith('h') ? num * 60 : num
    }
    
    // Determine task type and preferences
    let taskType = 'general'
    let preferredTimeOfDay = 'any'
    
    if (name.includes('workout') || name.includes('exercise') || name.includes('gym')) {
      taskType = 'fitness'
      preferredTimeOfDay = 'morning'
    } else if (name.includes('work') || name.includes('code') || name.includes('study')) {
      taskType = 'work'
      preferredTimeOfDay = 'morning'
    } else if (name.includes('meeting') || name.includes('call')) {
      taskType = 'meeting'
      preferredTimeOfDay = 'business_hours'
    } else if (name.includes('dinner') || name.includes('eat')) {
      taskType = 'meal'
      preferredTimeOfDay = 'evening'
    }
    
    return {
      originalTask: task,
      durationMinutes,
      taskType,
      preferredTimeOfDay,
      priority: definition.priority || 'medium',
      flexibility: definition.flexibility || 'normal'
    }
  }

  /**
   * Generate optimal schedule based on analysis
   */
  generateOptimalSchedule(analysis) {
    const now = new Date()
    const nextInterval = getNextInterval(now)
    
    // Calculate optimal start time based on preferences
    let optimalStartTime = new Date(nextInterval)
    
    // Adjust based on time preferences
    switch (analysis.preferredTimeOfDay) {
      case 'morning':
        // Schedule for next morning if it's after 6 PM, otherwise use next available slot
        if (now.getHours() >= 18) {
          optimalStartTime.setDate(optimalStartTime.getDate() + 1)
          optimalStartTime.setHours(8, 0, 0, 0)
        }
        break
        
      case 'evening':
        // Schedule for evening (6 PM or later)
        if (now.getHours() < 18) {
          optimalStartTime.setHours(18, 0, 0, 0)
        }
        break
        
      case 'business_hours':
        // Schedule during business hours (9 AM - 5 PM)
        if (now.getHours() < 9) {
          optimalStartTime.setHours(9, 0, 0, 0)
        } else if (now.getHours() >= 17) {
          optimalStartTime.setDate(optimalStartTime.getDate() + 1)
          optimalStartTime.setHours(9, 0, 0, 0)
        }
        break
        
      default:
        // Use next available interval
        break
    }
    
    // Ensure start time aligns with interval granularity
    const minutes = optimalStartTime.getMinutes()
    const alignedMinutes = Math.ceil(minutes / SCHEDULING_CONFIG.INTERVAL_GRANULARITY) * SCHEDULING_CONFIG.INTERVAL_GRANULARITY
    optimalStartTime.setMinutes(alignedMinutes >= 60 ? 0 : alignedMinutes, 0, 0)
    
    if (alignedMinutes >= 60) {
      optimalStartTime.setHours(optimalStartTime.getHours() + 1)
    }
    
    // Calculate end time
    const endTime = new Date(optimalStartTime.getTime() + (analysis.durationMinutes * 60 * 1000))
    
    return {
      startTime: optimalStartTime.toISOString(),
      endTime: endTime.toISOString(),
      durationMinutes: analysis.durationMinutes,
      confidence: 0.85, // Mock confidence score
      reasoning: this.generateReasoning(analysis, optimalStartTime)
    }
  }

  generateReasoning(analysis, startTime) {
    const timeStr = startTime.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    })
    
    return `Scheduled ${analysis.taskType} task "${analysis.originalTask.name}" for ${timeStr} based on ${analysis.preferredTimeOfDay} preference. Duration: ${analysis.durationMinutes} minutes.`
  }

  /**
   * Create a model record in the database
   */
  async createModelRecord(task, analysis) {
    const modelData = {
      user_id: task.user_id,
      model_time: Math.floor(Date.now() / 1000), // Unix timestamp
      priority_level: this.getPriorityLevel(analysis.priority)
    }
    
    const { data, error } = await this.supabase
      .schema(DATABASE_CONFIG.SCHEMA)
      .from(DATABASE_CONFIG.TABLES.MODEL)
      .insert(modelData)
      .select('model_id')
      .single()
    
    if (error) {
      throw new Error(`Failed to create model record: ${error.message}`)
    }
    return data.model_id
  }

  getPriorityLevel(priority) {
    switch (priority) {
      case 'high': return 3
      case 'medium': return 2
      case 'low': return 1
      default: return 2
    }
  }

  /**
   * Save solution to database
   */
  async saveSolution(modelId, schedule, taskAnalysis) {
    // First, create a solution_score record with the correct schema
    const solutionScoreData = {
      model_id: modelId,
      time_from_start: 0, // Mock value - time when solution was generated
      score: schedule.confidence,
      upper_bound: 1.0, // Mock upper bound value
      is_optimal: schedule.confidence > 0.8
    }
    
    const { data: scoreData, error: scoreError } = await this.supabase
      .schema(DATABASE_CONFIG.SCHEMA)
      .from(DATABASE_CONFIG.TABLES.SOLUTION_SCORE)
      .insert(solutionScoreData)
      .select('solution_score_id')
      .single()
    
    if (scoreError) {
      throw new Error(`Failed to create solution score: ${scoreError.message || JSON.stringify(scoreError)}`)
    }
    
    // Then create the solution with the actual solution_score_id
    const solutionData = {
      model_id: modelId,
      solution_score_id: scoreData.solution_score_id,
      solution_json: {
        schedule: schedule,
        algorithm: 'mock_ai_v1',
        generated_at: new Date().toISOString(),
        parameters: {
          interval_granularity: SCHEDULING_CONFIG.INTERVAL_GRANULARITY,
          optimization_target: 'user_preference'
        }
      }
    }
    
    const { data, error } = await this.supabase
      .schema(DATABASE_CONFIG.SCHEMA)
      .from(DATABASE_CONFIG.TABLES.SOLUTION)
      .insert(solutionData)
      .select()
      .single()
    
    if (error) {
      throw new Error(`Failed to save solution: ${error.message}`)
    }
    return data
  }
}