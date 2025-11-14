import { createClient } from '@supabase/supabase-js'
import { DATABASE_CONFIG, SCHEDULING_CONFIG } from '../config/globals.js'

export class TimelineGenerator {
  constructor(supabaseUrl, supabaseKey) {
    this.supabase = createClient(supabaseUrl, supabaseKey)
  }

  /**
   * Generate user timeline from solution
   * @param {Object} solutionData - The generated solution data
   * @returns {Object} Timeline data
   */
  async generateTimeline(solutionData) {
    const { modelId, solution, schedule, taskAnalysis } = solutionData
    
    console.log(`📅 Generating timeline for model_id: ${modelId}`)

    try {
      // Step 1: Get user's existing timeline if any
      const existingTimeline = await this.getExistingTimeline(taskAnalysis.originalTask.user_id)
      
      // Step 2: Generate new timeline with the scheduled task
      const newTimeline = this.createTimelineWithNewTask(existingTimeline, schedule, taskAnalysis)
      
      // Step 3: Save timeline to database
      const savedTimeline = await this.saveTimeline(
        taskAnalysis.originalTask.user_id,
        modelId,
        newTimeline
      )
      
      console.log(`✅ Timeline generated and saved for user ${taskAnalysis.originalTask.user_id}`)
      
      return savedTimeline
    } catch (error) {
      console.error(`❌ Error generating timeline:`, error)
      throw error
    }
  }

  /**
   * Get user's most recent timeline
   */
  async getExistingTimeline(userId) {
    const { data, error } = await this.supabase
      .schema(DATABASE_CONFIG.SCHEMA)
      .from(DATABASE_CONFIG.TABLES.USER_TIMELINE)
      .select('*')
      .eq('user_id', userId)
      .eq('timeline_type', 'calendar')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    
    if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows returned"
      console.error('Error fetching existing timeline:', error)
      return null
    }
    
    return data
  }

  /**
   * Create new timeline by integrating the new task
   */
  createTimelineWithNewTask(existingTimeline, schedule, taskAnalysis) {
    const newTask = {
      name: taskAnalysis.originalTask.name,
      start_time: schedule.startTime,
      end_time: schedule.endTime,
      duration: schedule.durationMinutes * 60, // Convert to seconds
      task_type: taskAnalysis.taskType,
      priority: taskAnalysis.priority,
      auto_generated: true,
      task_id: taskAnalysis.originalTask.task_id
    }

    let timelineTasks = []
    
    if (existingTimeline && existingTimeline.timeline_json && existingTimeline.timeline_json.tasks) {
      const now = new Date()
      const taskMap = new Map()

      for (const task of existingTimeline.timeline_json.tasks) {
        const endString = task.end_time || task.endTime || task.end
        const endDate = endString ? new Date(endString) : null
        if (!endDate || endDate <= now) continue

        // Remove prior auto-generated context tasks tied to this new task
        if (task.auto_generated && task.parent_task === newTask.task_id) {
          continue
        }

        const key = task.task_id || task.id || `${task.name}-${task.start_time || task.start || ''}`
        if (!taskMap.has(key)) {
          taskMap.set(key, task)
        } else {
          // If duplicate keys exist, prefer the most recent timeline entry (later start time)
          const existing = taskMap.get(key)
          const existingStart = new Date(existing.start_time || existing.start || 0)
          const newStart = new Date(task.start_time || task.start || 0)
          if (newStart > existingStart) {
            taskMap.set(key, task)
          }
        }
      }

      timelineTasks = Array.from(taskMap.values())
    }

    // Add the new task
    timelineTasks = timelineTasks.filter(task => task.task_id !== newTask.task_id)
    timelineTasks.push(newTask)

    // Sort tasks by start time
    timelineTasks.sort((a, b) => new Date(a.start_time) - new Date(b.start_time))

    // Resolve any conflicts by adjusting times if needed
    timelineTasks = this.resolveTimeConflicts(timelineTasks)

    // Generate additional context tasks only when enabled
    if (SCHEDULING_CONFIG.ENABLE_CONTEXT_TASKS) {
      timelineTasks = this.addContextTasks(timelineTasks, newTask)
    }

    return {
      tasks: timelineTasks,
      created_at: new Date().toISOString(),
      description: `Updated timeline with new task: ${newTask.name}`,
      last_updated_task: newTask.task_id,
      total_tasks: timelineTasks.length
    }
  }

  /**
   * Resolve scheduling conflicts between tasks
   */
  resolveTimeConflicts(tasks) {
    const resolvedTasks = []
    
    for (let i = 0; i < tasks.length; i++) {
      const currentTask = { ...tasks[i] }
      
      if (i > 0) {
        const previousTask = resolvedTasks[i - 1]
        const previousEndTime = new Date(previousTask.end_time)
        const currentStartTime = new Date(currentTask.start_time)
        
        // If there's a conflict (overlap), adjust the current task's start time
        if (currentStartTime < previousEndTime) {
          const newStartTime = new Date(previousEndTime.getTime() + 5 * 60 * 1000) // 5 min buffer
          const duration = currentTask.duration * 1000 // Convert to milliseconds
          const newEndTime = new Date(newStartTime.getTime() + duration)
          
          currentTask.start_time = newStartTime.toISOString()
          currentTask.end_time = newEndTime.toISOString()
          
          console.log(`⚠️ Resolved conflict: moved "${currentTask.name}" to ${newStartTime.toLocaleTimeString()}`)
        }
      }
      
      resolvedTasks.push(currentTask)
    }
    
    return resolvedTasks
  }

  /**
   * Add context tasks to make the timeline more realistic
   */
  addContextTasks(tasks, newTask) {
    const contextTasks = []
    const newTaskStart = new Date(newTask.start_time)
    const newTaskEnd = new Date(newTask.end_time)
    
    // Add a preparation task before the main task (if it's a significant task)
    if (newTask.duration >= 1800) { // 30 minutes or longer
      const prepTime = new Date(newTaskStart.getTime() - 10 * 60 * 1000) // 10 min before
      contextTasks.push({
        name: `Prepare for ${newTask.name}`,
        start_time: prepTime.toISOString(),
        end_time: newTaskStart.toISOString(),
        duration: 600, // 10 minutes
        task_type: 'preparation',
        priority: 'low',
        auto_generated: true,
        parent_task: newTask.task_id
      })
    }

    // Add a break after the task
    const breakStart = new Date(newTaskEnd.getTime())
    const breakEnd = new Date(breakStart.getTime() + 15 * 60 * 1000) // 15 min break
    contextTasks.push({
      name: 'Break',
      start_time: breakStart.toISOString(),
      end_time: breakEnd.toISOString(),
      duration: 900, // 15 minutes
      task_type: 'break',
      priority: 'low',
      auto_generated: true,
      parent_task: newTask.task_id
    })

    // Merge context tasks with main tasks and sort
    const allTasks = [...tasks, ...contextTasks]
    return allTasks.sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
  }

  /**
   * Save timeline to database
   */
  async saveTimeline(userId, modelId, timelineJson) {
    const timelineData = {
      user_id: userId,
      model_id: modelId,
      timeline_json: timelineJson,
      timeline_type: 'calendar'
    }
    
    const { data, error } = await this.supabase
      .schema(DATABASE_CONFIG.SCHEMA)
      .from(DATABASE_CONFIG.TABLES.USER_TIMELINE)
      .insert(timelineData)
      .select()
      .single()
    
    if (error) {
      throw new Error(`Failed to save timeline: ${error.message}`)
    }
    
    return data
  }

  /**
   * Generate a notification timeline (simplified version for notifications)
   */
  async generateNotificationTimeline(userId, modelId, schedule, taskAnalysis) {
    const notificationTimeline = {
      upcoming_task: {
        name: taskAnalysis.originalTask.name,
        start_time: schedule.startTime,
        duration: schedule.durationMinutes,
        type: taskAnalysis.taskType
      },
      created_at: new Date().toISOString(),
      purpose: 'notification'
    }
    
    const timelineData = {
      user_id: userId,
      model_id: modelId,
      timeline_json: notificationTimeline,
      timeline_type: 'notification'
    }
    
    const { data, error } = await this.supabase
      .schema(DATABASE_CONFIG.SCHEMA)
      .from(DATABASE_CONFIG.TABLES.USER_TIMELINE)
      .insert(timelineData)
      .select()
      .single()
    
    if (error) {
      throw new Error(`Failed to save notification timeline: ${error.message}`)
    }
    
    return data
  }
}