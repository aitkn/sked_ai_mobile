import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { SCHEDULING_CONFIG, DATABASE_CONFIG, getNextInterval } from '../config/globals.js'

// Tasks/entities/locations created via the LLM RPC live in the public schema
// Tables touched by the LLM RPC (task, model, solution, etc.) live in the public schema
const TASK_DATA_SCHEMA = 'public'

// Epoch reference date (same as web app)
const EPOCH = new Date('2020-01-01T00:00:00Z')
const INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Convert datetime to interval number (same as web app's dt2n)
 * @param {Date|string} dateTime - ISO string or Date object
 * @returns {number} Interval number
 */
function dt2n(dateTime) {
  const date = typeof dateTime === 'string' ? new Date(dateTime) : dateTime
  const diffMs = date.getTime() - EPOCH.getTime()
  return Math.floor(diffMs / INTERVAL_MS)
}

function safeParseJSON(value) {
  if (!value) return null
  if (typeof value === 'object') return value
  if (typeof value !== 'string') return null
  try {
    return JSON.parse(value)
  } catch (error) {
    console.warn('[SolutionGenerator] Failed to parse JSON value:', error?.message)
    return null
  }
}

function parseDateTime(value) {
  if (!value) return null
  const trimmed = typeof value === 'string' ? value.trim().replace(/^"|"$/g, '') : value
  if (!trimmed) return null

  const firstPass = new Date(trimmed)
  if (!Number.isNaN(firstPass.getTime())) return firstPass

  // If no timezone provided, try assuming UTC by appending 'Z'
  if (typeof trimmed === 'string' && !/[zZ]|[+-]\d{2}:\d{2}$/.test(trimmed)) {
    const withZ = `${trimmed}Z`
    const secondPass = new Date(withZ)
    if (!Number.isNaN(secondPass.getTime())) return secondPass
  }

  return null
}

function parseDurationToMinutes(value) {
  if (value === null || value === undefined) return null
  if (typeof value === 'number' && !Number.isNaN(value)) {
    // Assume minutes if already a number
    return Math.max(1, Math.round(value))
  }

  const raw = String(value).trim().toLowerCase().replace(/"/g, '')
  if (!raw) return null

  // ISO 8601 duration e.g. PT1H30M
  const isoMatch = raw.match(/^pt(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i)
  if (isoMatch) {
    const [, h, m, s] = isoMatch
    const minutes = (parseInt(h || '0', 10) * 60) + parseInt(m || '0', 10) + Math.round(parseInt(s || '0', 10) / 60)
    return minutes > 0 ? minutes : null
  }

  const unitMatch = raw.match(/^(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes|s|sec|secs|second|seconds)?$/)
  if (unitMatch) {
    const amount = parseFloat(unitMatch[1])
    const unit = unitMatch[2] || 'm'

    if (Number.isNaN(amount)) return null

    switch (unit) {
      case 'h':
      case 'hr':
      case 'hrs':
      case 'hour':
      case 'hours':
        return Math.round(amount * 60)
      case 's':
      case 'sec':
      case 'secs':
      case 'second':
      case 'seconds':
        return Math.max(1, Math.round(amount / 60))
      case 'm':
      case 'min':
      case 'mins':
      case 'minute':
      case 'minutes':
      default:
        return Math.round(amount)
    }
  }

  // Fallback: try parsing as integer minutes
  const numeric = parseInt(raw, 10)
  return Number.isNaN(numeric) ? null : numeric
}

function alignToInterval(date, granularityMinutes = SCHEDULING_CONFIG.INTERVAL_GRANULARITY) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return date
  const aligned = new Date(date)
  aligned.setMilliseconds(0)
  aligned.setSeconds(0)

  const minutes = aligned.getMinutes()
  const remainder = minutes % granularityMinutes
  if (remainder !== 0) {
    aligned.setMinutes(minutes + (granularityMinutes - remainder), 0, 0)
  }
  return aligned
}

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
      const constraintInfo = this.extractScheduleConstraints(task)
      taskAnalysis.constraints = constraintInfo
      
      // Step 2: Generate optimal scheduling
      const schedule = this.generateOptimalSchedule(taskAnalysis, constraintInfo)
      
      // Step 3: Get or create model record
      // Try to use existing model from current_model first, otherwise create new one
      let modelId = await this.getOrCreateModel(task.user_id, task, taskAnalysis)
      
      // Step 4: Save solution to database
      const solution = await this.saveSolution(modelId, schedule)
      
      // Step 5: Create task_solution entry (for mobile app compatibility)
      await this.saveTaskSolution(task, modelId, schedule)
      
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
   * Extract scheduling constraints from task rules/metadata
   */
  extractScheduleConstraints(task) {
    const result = {
      startExact: null,
      earliestStart: null,
      latestStart: null,
      endExact: null,
      latestEnd: null,
      durationMinutes: null
    }

    const rules = safeParseJSON(task?.rules) || task?.rules
    const constraintArray = Array.isArray(rules?.constraints) ? rules.constraints : []

    for (const rawConstraint of constraintArray) {
      if (typeof rawConstraint !== 'string') continue
      const trimmed = rawConstraint.trim()
      if (!trimmed) continue

      const match = trimmed.match(/^(start|end|duration)\s*([<>!=]+)\s*(.+)$/i)
      if (!match) continue

      const [, keyRaw, operatorRaw, valueRaw] = match
      const key = keyRaw.toLowerCase()
      const operator = operatorRaw.replace(/\s+/g, '')
      const value = valueRaw.trim()

      if (key === 'duration') {
        const duration = parseDurationToMinutes(value)
        if (duration) {
          result.durationMinutes = duration
        }
        continue
      }

      const parsedDate = parseDateTime(value)
      if (!parsedDate) continue

      if (key === 'start') {
        if (operator === '==' || operator === '=') {
          result.startExact = parsedDate
        } else if (operator.includes('>')) {
          // start >= value (earliest start)
          result.earliestStart = parsedDate
        } else if (operator.includes('<')) {
          result.latestStart = parsedDate
        }
      } else if (key === 'end') {
        if (operator === '==' || operator === '=') {
          result.endExact = parsedDate
        } else if (operator.includes('<')) {
          result.latestEnd = parsedDate
        }
      }
    }

    return result
  }

  /**
   * Generate optimal schedule based on analysis
   */
  generateOptimalSchedule(analysis, constraints = {}) {
    const now = new Date()
    const nextInterval = getNextInterval(now)

    let durationMinutes = constraints.durationMinutes || analysis.durationMinutes
    let optimalStartTime = null

    if (constraints.startExact) {
      optimalStartTime = new Date(constraints.startExact)
    } else if (constraints.earliestStart) {
      optimalStartTime = new Date(constraints.earliestStart)
    } else {
      // Calculate optimal start time based on preferences
      optimalStartTime = new Date(nextInterval)

      switch (analysis.preferredTimeOfDay) {
        case 'morning':
          if (now.getHours() >= 18) {
            optimalStartTime.setDate(optimalStartTime.getDate() + 1)
            optimalStartTime.setHours(8, 0, 0, 0)
          }
          break

        case 'evening':
          if (now.getHours() < 18) {
            optimalStartTime.setHours(18, 0, 0, 0)
          }
          break

        case 'business_hours':
          if (now.getHours() < 9) {
            optimalStartTime.setHours(9, 0, 0, 0)
          } else if (now.getHours() >= 17) {
            optimalStartTime.setDate(optimalStartTime.getDate() + 1)
            optimalStartTime.setHours(9, 0, 0, 0)
          }
          break

        default:
          // Leave as next interval
          break
      }
    }

    // Align with interval granularity only when we don't have an explicit exact start
    if (!constraints.startExact) {
      optimalStartTime = alignToInterval(optimalStartTime)

      if (constraints.earliestStart && optimalStartTime < constraints.earliestStart) {
        // Step forward until we satisfy earliest start
        while (optimalStartTime < constraints.earliestStart) {
          optimalStartTime = new Date(optimalStartTime.getTime() + (SCHEDULING_CONFIG.INTERVAL_GRANULARITY * 60 * 1000))
        }
      }
    }

    // Ensure start time is not in the past
    if (optimalStartTime < now && !constraints.startExact) {
      optimalStartTime = alignToInterval(getNextInterval(now))
    }

    let endTime = new Date(optimalStartTime.getTime() + (durationMinutes * 60 * 1000))

    if (constraints.endExact) {
      endTime = new Date(constraints.endExact)
      if (!constraints.durationMinutes) {
        durationMinutes = Math.max(5, Math.round((endTime.getTime() - optimalStartTime.getTime()) / 60000))
      } else {
        // Adjust start so that duration aligns with provided end
        optimalStartTime = new Date(endTime.getTime() - durationMinutes * 60 * 1000)
      }
    } else if (constraints.latestEnd && endTime > constraints.latestEnd) {
      endTime = new Date(constraints.latestEnd)
      durationMinutes = Math.max(5, Math.round((endTime.getTime() - optimalStartTime.getTime()) / 60000))
    }

    // Guard against negative durations
    if (durationMinutes <= 0) {
      durationMinutes = analysis.durationMinutes
      endTime = new Date(optimalStartTime.getTime() + (durationMinutes * 60 * 1000))
    }

    return {
      startTime: optimalStartTime.toISOString(),
      endTime: endTime.toISOString(),
      durationMinutes,
      confidence: constraints.startExact ? 0.95 : 0.85, // Higher confidence when respecting explicit constraints
      reasoning: this.generateReasoning(analysis, optimalStartTime, durationMinutes, constraints)
    }
  }

  generateReasoning(analysis, startTime, durationMinutes, constraints = {}) {
    const timeStr = startTime.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    })

    if (constraints.startExact) {
      return `Scheduled "${analysis.originalTask.name}" at ${timeStr} to satisfy the requested start time. Duration: ${durationMinutes} minutes.`
    }
    
    return `Scheduled ${analysis.taskType} task "${analysis.originalTask.name}" for ${timeStr} based on ${analysis.preferredTimeOfDay} preference. Duration: ${durationMinutes} minutes.`
  }

  /**
   * Get existing model from current_model or create a new one
   */
  async getOrCreateModel(userId, task, analysis) {
    // First, try to get the current model for this user
    const { data: currentModel, error: currentModelError } = await this.supabase
      .schema(TASK_DATA_SCHEMA)
      .from('current_model')
      .select('model_id')
      .eq('user_id', userId)
      .single()

    if (!currentModelError && currentModel && currentModel.model_id) {
      console.log(`📋 Using existing model from current_model: ${currentModel.model_id}`)
      return currentModel.model_id
    }

    // No current model found, create a new one
    console.log(`📋 No current model found, creating new model...`)
    return await this.createModelRecord(task, analysis)
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
      .schema(TASK_DATA_SCHEMA)
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
   * Handles race conditions when multiple tasks share the same model_id
   */
  async saveSolution(modelId, schedule) {
    // Check if a solution already exists for this model_id
    // This prevents duplicate key errors when multiple tasks share the same model
    const { data: existingSolution, error: checkError } = await this.supabase
      .schema(TASK_DATA_SCHEMA)
      .from(DATABASE_CONFIG.TABLES.SOLUTION)
      .select('model_id, solution_score_id, solution_json')
      .eq('model_id', modelId)
      .limit(1)
      .maybeSingle()
    
    if (checkError && checkError.code !== 'PGRST116') {
      // PGRST116 is "not found" which is fine, other errors are real problems
      throw new Error(`Failed to check for existing solution: ${checkError.message}`)
    }
    
    // If solution already exists, return it (multiple tasks can share the same solution)
    if (existingSolution) {
      console.log(`📋 Reusing existing solution for model_id: ${modelId}`)
      return existingSolution
    }
    
    // No existing solution, create a new one
    // First, create a solution_score entry (required foreign key)
    const solutionScoreId = randomUUID()
    const solutionScoreData = {
      solution_score_id: solutionScoreId,
      model_id: modelId,
      time_from_start: 0, // Mock: optimization started immediately
      score: 100.0, // Mock score (lower is better in real system)
      upper_bound: 100.0, // Mock upper bound
      is_optimal: true, // Mock: mark as optimal
      created_at: new Date().toISOString()
    }
    
    const { error: scoreError } = await this.supabase
      .schema(TASK_DATA_SCHEMA)
      .from('solution_score')
      .insert(solutionScoreData)
    
    if (scoreError) {
      // If solution_score insert fails due to duplicate, check if solution exists now
      // (race condition: another process created it between our check and insert)
      if (scoreError.code === '23505' || scoreError.message.includes('duplicate')) {
        const { data: raceSolution } = await this.supabase
          .schema(TASK_DATA_SCHEMA)
          .from(DATABASE_CONFIG.TABLES.SOLUTION)
          .select('model_id, solution_score_id, solution_json')
          .eq('model_id', modelId)
          .limit(1)
          .maybeSingle()
        
        if (raceSolution) {
          console.log(`📋 Race condition detected: solution now exists for model_id: ${modelId}`)
          return raceSolution
        }
      }
      throw new Error(`Failed to create solution score: ${scoreError.message}`)
    }
    
    // Now create the solution with the valid solution_score_id
    const solutionData = {
      model_id: modelId,
      solution_score_id: solutionScoreId,
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
      .schema(TASK_DATA_SCHEMA)
      .from(DATABASE_CONFIG.TABLES.SOLUTION)
      .insert(solutionData)
      .select()
      .single()
    
    if (error) {
      // Handle duplicate key error (race condition: another process created solution)
      if (error.code === '23505' || error.message.includes('duplicate key') || error.message.includes('solution_pk')) {
        console.log(`⚠️ Duplicate key detected for model_id: ${modelId}, fetching existing solution...`)
        
        // Fetch the existing solution that was created by another process
        const { data: existing, error: fetchError } = await this.supabase
          .schema(TASK_DATA_SCHEMA)
          .from(DATABASE_CONFIG.TABLES.SOLUTION)
          .select('model_id, solution_score_id, solution_json')
          .eq('model_id', modelId)
          .limit(1)
          .maybeSingle()
        
        if (fetchError) {
          throw new Error(`Failed to fetch existing solution after duplicate key error: ${fetchError.message}`)
        }
        
        if (existing) {
          console.log(`✅ Retrieved existing solution for model_id: ${modelId}`)
          return existing
        }
      }
      
      throw new Error(`Failed to save solution: ${error.message}`)
    }
    
    return data
  }

  /**
   * Save task_solution entry (for mobile app compatibility)
   * This is what the mobile app's TaskSyncService looks for
   */
  async saveTaskSolution(task, modelId, schedule) {
    try {
      // Support both shapes (task.task_id or task.id)
      const taskId = task?.task_id || task?.id
      if (!taskId) {
        console.warn('⚠️ Cannot create task_solution: missing task_id on task object')
        return null
      }

      // CRITICAL: Verify task exists in database before creating task_solution
      // The foreign key constraint requires the task to exist
      const { data: existingTask, error: taskCheckError } = await this.supabase
        .schema(TASK_DATA_SCHEMA)
        .from(DATABASE_CONFIG.TABLES.TASK)
        .select('task_id')
        .eq('task_id', taskId)
        .single()

      if (taskCheckError || !existingTask) {
        console.error(`❌ Task ${taskId} does not exist in database. Cannot create task_solution.`)
        console.error(`   Task check error: ${taskCheckError?.message || 'Task not found'}`)
        return null
      }

      console.log(`✅ Verified task ${taskId} exists in database`)

      // Get entity_id from task_entity relationship
      const { data: taskEntities, error: entityError } = await this.supabase
        .schema(TASK_DATA_SCHEMA)
        .from('task_entity')
        .select('entity_id')
        .eq('task_id', taskId)
        .limit(1)
        .single()

      const entityId = taskEntities?.entity_id || null
      if (entityError && entityError.code !== 'PGRST116') {
        console.warn(`⚠️ Error fetching task_entity: ${entityError.message}`)
      }

      // Get location_id from task_location relationship
      const { data: taskLocation, error: locationError } = await this.supabase
        .schema(TASK_DATA_SCHEMA)
        .from('task_location')
        .select('user_location_id')
        .eq('task_id', taskId)
        .limit(1)
        .single()

      if (locationError && locationError.code !== 'PGRST116') {
        console.warn(`⚠️ Error fetching task_location: ${locationError.message}`)
      }

      // Convert timestamps to interval numbers
      const startInterval = dt2n(schedule.startTime)
      const endInterval = dt2n(schedule.endTime)

      // Create task_solution entry
      const taskSolutionData = {
        task_id: taskId,
        model_id: modelId,
        solution_json: {
          start: String(startInterval),
          end: String(endInterval),
          status: 'OPTIMAL',
          task_id: taskId,
          entity_id: entityId,
          location_id: taskLocation?.user_location_id || null
        }
      }

      const { data, error } = await this.supabase
        .schema(TASK_DATA_SCHEMA)
        .from('task_solution')
        .insert(taskSolutionData)
        .select()
        .single()

      if (error) {
        console.error(`❌ Failed to create task_solution entry: ${error.message}`)
        console.error(`   Error code: ${error.code}`)
        console.error(`   Error details: ${JSON.stringify(error, null, 2)}`)
        console.error(`   Task ID: ${taskId}, Model ID: ${modelId}`)
        // Don't throw - this is optional for mobile app compatibility
        return null
      }

      console.log(`✅ Created task_solution entry for task ${task.name} (${taskId})`)
      return data
    } catch (error) {
      console.error(`❌ Error creating task_solution entry: ${error.message}`)
      console.error(`   Stack: ${error.stack}`)
      // Don't throw - this is optional
      return null
    }
  }
}