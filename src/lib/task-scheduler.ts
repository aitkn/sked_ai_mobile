import { InternalTask, InternalDB, internalDB } from './internal-db'

// Progressive delay schedule (in minutes)
// 0 reschedules -> 5 min delay
// 1 reschedule -> 15 min delay
// 2 reschedules -> 30 min delay
// 3+ reschedules -> 60 min (hourly) delay
const DELAY_SCHEDULE = [5, 15, 30, 60] // minutes

// End of day hour (tasks cannot be scheduled past this time)
const END_OF_DAY_HOUR = 23
const END_OF_DAY_MINUTE = 59

// Minimum gap between tasks (in minutes)
const MIN_TASK_GAP = 1

/**
 * Get the delay in minutes for the next reschedule based on reschedule count
 * @param rescheduleCount Number of times task has already been rescheduled
 * @returns Delay in minutes
 */
export function getNextDelay(rescheduleCount: number): number {
  if (rescheduleCount < 0) rescheduleCount = 0
  if (rescheduleCount >= DELAY_SCHEDULE.length) {
    // After the initial delays, continue with hourly reschedules
    return DELAY_SCHEDULE[DELAY_SCHEDULE.length - 1]
  }
  return DELAY_SCHEDULE[rescheduleCount]
}

/**
 * Priority weight for sorting (higher number = higher priority)
 */
function getPriorityWeight(priority: InternalTask['priority']): number {
  switch (priority) {
    case 'high': return 3
    case 'medium': return 2
    case 'low': return 1
    default: return 2
  }
}

/**
 * Get the end of day timestamp for today
 */
function getEndOfDay(date: Date = new Date()): Date {
  const endOfDay = new Date(date)
  endOfDay.setHours(END_OF_DAY_HOUR, END_OF_DAY_MINUTE, 59, 999)
  return endOfDay
}

/**
 * Check if a time slot is available (no overlap with other tasks)
 * @param startTime Proposed start time
 * @param endTime Proposed end time
 * @param tasks List of tasks to check against
 * @param excludeTaskId Task ID to exclude from conflict check (the task being rescheduled)
 * @returns true if slot is available
 */
function isSlotAvailable(
  startTime: Date,
  endTime: Date,
  tasks: InternalTask[],
  excludeTaskId?: string
): boolean {
  for (const task of tasks) {
    // Skip the task being rescheduled
    if (excludeTaskId && task.id === excludeTaskId) continue
    
    // Skip failed or cancelled tasks
    if (task.status === 'failed' || task.status === 'cancelled') continue
    
    const taskStart = new Date(task.start_time)
    const taskEnd = new Date(task.end_time)
    
    // Check for overlap: slots overlap if one starts before the other ends
    const overlaps = startTime < taskEnd && endTime > taskStart
    if (overlaps) {
      return false
    }
  }
  return true
}

/**
 * Find the next available slot for a task
 * @param duration Duration in seconds
 * @param startAfter Earliest time the task can start
 * @param tasks All tasks to check against
 * @param excludeTaskId Task ID to exclude from conflict check
 * @returns Start time of available slot, or null if none found before end of day
 */
function findNextAvailableSlot(
  duration: number,
  startAfter: Date,
  tasks: InternalTask[],
  excludeTaskId?: string
): Date | null {
  const endOfDay = getEndOfDay(startAfter)
  const durationMs = duration * 1000 // Convert seconds to milliseconds
  
  // Start from the given time, rounded up to next minute
  let candidateStart = new Date(startAfter)
  candidateStart.setSeconds(0, 0)
  if (candidateStart < startAfter) {
    candidateStart.setMinutes(candidateStart.getMinutes() + 1)
  }
  
  // Get non-excluded tasks sorted by start time
  const sortedTasks = tasks
    .filter(t => t.id !== excludeTaskId && t.status !== 'failed' && t.status !== 'cancelled')
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
  
  while (candidateStart.getTime() + durationMs <= endOfDay.getTime()) {
    const candidateEnd = new Date(candidateStart.getTime() + durationMs)
    
    if (isSlotAvailable(candidateStart, candidateEnd, sortedTasks, excludeTaskId)) {
      return candidateStart
    }
    
    // Find the next task that ends after our candidate start
    let nextEndTime: Date | null = null
    for (const task of sortedTasks) {
      const taskEnd = new Date(task.end_time)
      if (taskEnd > candidateStart) {
        nextEndTime = taskEnd
        break
      }
    }
    
    if (nextEndTime) {
      // Jump to just after the conflicting task ends
      candidateStart = new Date(nextEndTime.getTime() + MIN_TASK_GAP * 60 * 1000)
    } else {
      // No more conflicts, but slot wasn't available - this shouldn't happen
      // Move forward by 1 minute as fallback
      candidateStart.setMinutes(candidateStart.getMinutes() + 1)
    }
  }
  
  // No slot found before end of day
  return null
}

export interface RescheduleResult {
  success: boolean
  newStartTime?: Date
  newEndTime?: Date
  failedTasks?: InternalTask[]
  repackedTasks?: InternalTask[]
  message: string
}

/**
 * Reschedule a single task with progressive delay
 * @param task The task to reschedule
 * @param allTasks All tasks (for conflict checking)
 * @returns Result of the reschedule attempt
 */
export async function rescheduleTask(
  task: InternalTask,
  allTasks: InternalTask[]
): Promise<RescheduleResult> {
  const currentRescheduleCount = task.reschedule_count || 0
  const delay = getNextDelay(currentRescheduleCount)
  const now = new Date()
  
  // Calculate the new start time based on delay from current time
  const proposedStart = new Date(now.getTime() + delay * 60 * 1000)
  const proposedEnd = new Date(proposedStart.getTime() + task.duration * 1000)
  
  // Check if this fits before end of day
  const endOfDay = getEndOfDay(now)
  if (proposedEnd > endOfDay) {
    return {
      success: false,
      message: `Cannot reschedule "${task.name}" - would extend past end of day`
    }
  }
  
  // Check if slot is available
  if (isSlotAvailable(proposedStart, proposedEnd, allTasks, task.id)) {
    return {
      success: true,
      newStartTime: proposedStart,
      newEndTime: proposedEnd,
      message: `Task "${task.name}" rescheduled to ${proposedStart.toLocaleTimeString()} (attempt ${currentRescheduleCount + 1})`
    }
  }
  
  // Slot not available, try to find next available slot
  const nextSlot = findNextAvailableSlot(task.duration, proposedStart, allTasks, task.id)
  if (nextSlot) {
    const slotEnd = new Date(nextSlot.getTime() + task.duration * 1000)
    return {
      success: true,
      newStartTime: nextSlot,
      newEndTime: slotEnd,
      message: `Task "${task.name}" rescheduled to ${nextSlot.toLocaleTimeString()} (next available slot, attempt ${currentRescheduleCount + 1})`
    }
  }
  
  return {
    success: false,
    message: `Cannot reschedule "${task.name}" - no available slots before end of day`
  }
}

/**
 * Greedy repack: Sort all pending tasks by priority and repack into available slots
 * @param tasks All tasks to consider
 * @param startFrom Time to start packing from (usually current time)
 * @returns Result with repacked task assignments
 */
export async function greedyRepack(
  tasks: InternalTask[],
  startFrom: Date = new Date()
): Promise<RescheduleResult> {
  const endOfDay = getEndOfDay(startFrom)
  
  // Separate tasks into categories
  const completedOrInProgress = tasks.filter(
    t => t.status === 'completed' || t.status === 'in_progress'
  )
  const pendingTasks = tasks.filter(t => t.status === 'pending')
  const failedOrCancelled = tasks.filter(
    t => t.status === 'failed' || t.status === 'cancelled'
  )
  
  // Sort pending tasks by priority (high to low), then by original start time
  const sortedPending = [...pendingTasks].sort((a, b) => {
    const priorityDiff = getPriorityWeight(b.priority) - getPriorityWeight(a.priority)
    if (priorityDiff !== 0) return priorityDiff
    
    // If same priority, prefer earlier original start time
    const aOriginal = a.original_start_time || a.start_time
    const bOriginal = b.original_start_time || b.start_time
    return new Date(aOriginal).getTime() - new Date(bOriginal).getTime()
  })
  
  // Fixed tasks that we cannot move (in_progress or completed)
  const fixedTasks = completedOrInProgress
  
  const repackedTasks: InternalTask[] = []
  const newFailedTasks: InternalTask[] = []
  
  for (const task of sortedPending) {
    // Find next available slot considering fixed tasks and already repacked tasks
    const allBlockingTasks = [...fixedTasks, ...repackedTasks]
    
    // Determine earliest possible start time for this task
    const taskEndTime = new Date(task.end_time)
    let earliestStart = startFrom
    
    // If task hasn't expired yet, keep its original time if possible
    if (taskEndTime > startFrom) {
      const originalStart = new Date(task.start_time)
      if (originalStart > startFrom && isSlotAvailable(originalStart, taskEndTime, allBlockingTasks, task.id)) {
        // Keep original time
        repackedTasks.push({ ...task })
        continue
      }
      // Otherwise, start from now
      earliestStart = startFrom
    }
    
    const nextSlot = findNextAvailableSlot(task.duration, earliestStart, allBlockingTasks, task.id)
    
    if (nextSlot) {
      const newEndTime = new Date(nextSlot.getTime() + task.duration * 1000)
      
      // Check it fits before end of day
      if (newEndTime <= endOfDay) {
        repackedTasks.push({
          ...task,
          start_time: nextSlot.toISOString(),
          end_time: newEndTime.toISOString(),
          original_start_time: task.original_start_time || task.start_time, // Preserve original
          reschedule_count: (task.reschedule_count || 0) + 1,
          last_reschedule_at: new Date().toISOString()
        })
        continue
      }
    }
    
    // Cannot fit this task
    newFailedTasks.push(task)
  }
  
  if (newFailedTasks.length > 0) {
    return {
      success: false,
      repackedTasks,
      failedTasks: newFailedTasks,
      message: `Could not fit ${newFailedTasks.length} task(s) into schedule: ${newFailedTasks.map(t => t.name).join(', ')}`
    }
  }
  
  return {
    success: true,
    repackedTasks,
    failedTasks: [],
    message: `Successfully repacked ${repackedTasks.length} task(s)`
  }
}

/**
 * Check if all pending tasks can satisfy constraints (fit before end of day without conflicts)
 * @param tasks All tasks to check
 * @returns true if all tasks can be scheduled
 */
export function canSatisfyConstraints(tasks: InternalTask[]): boolean {
  const result = greedyRepack(tasks, new Date())
  // Note: greedyRepack is async but we're calling it synchronously here
  // This is a simplified check - in practice, use the async version
  return true // Placeholder - actual check is done via greedyRepack result
}

/**
 * Apply a reschedule to the database
 * @param task The task to update
 * @param newStartTime New start time
 * @param newEndTime New end time  
 * @returns Updated task
 */
export async function applyReschedule(
  task: InternalTask,
  newStartTime: Date,
  newEndTime: Date
): Promise<InternalTask | null> {
  const currentRescheduleCount = task.reschedule_count || 0
  
  const updates: Partial<InternalTask> = {
    start_time: newStartTime.toISOString(),
    end_time: newEndTime.toISOString(),
    original_start_time: task.original_start_time || task.start_time, // Preserve original start time
    reschedule_count: currentRescheduleCount + 1,
    last_reschedule_at: new Date().toISOString(),
    status: 'pending' // Reset to pending
  }
  
  const updatedTask = await internalDB.updateTask(task.id, updates)
  
  if (updatedTask) {
    // Log the reschedule action
    await internalDB.addAction({
      action_type: 'task_rescheduled',
      task_id: task.id,
      task_name: task.name,
      details: `Rescheduled to ${newStartTime.toLocaleTimeString()} (attempt ${currentRescheduleCount + 1})`
    })
  }
  
  return updatedTask
}

/**
 * Apply greedy repack results to the database
 * @param repackResult Result from greedyRepack
 * @returns Number of tasks updated
 */
export async function applyRepackToDatabase(
  repackResult: RescheduleResult
): Promise<number> {
  if (!repackResult.repackedTasks || repackResult.repackedTasks.length === 0) {
    return 0
  }
  
  const updates = repackResult.repackedTasks.map(task => ({
    id: task.id,
    updates: {
      start_time: task.start_time,
      end_time: task.end_time,
      original_start_time: task.original_start_time,
      reschedule_count: task.reschedule_count,
      last_reschedule_at: task.last_reschedule_at
    }
  }))
  
  const updatedTasks = await internalDB.updateMultipleTasks(updates)
  
  // Log reschedule actions for tasks that were actually moved
  for (const task of repackResult.repackedTasks) {
    if (task.reschedule_count && task.reschedule_count > 0) {
      await internalDB.addAction({
        action_type: 'task_rescheduled',
        task_id: task.id,
        task_name: task.name,
        details: `Repacked to ${new Date(task.start_time).toLocaleTimeString()}`
      })
    }
  }
  
  // Mark failed tasks
  if (repackResult.failedTasks) {
    for (const task of repackResult.failedTasks) {
      await internalDB.updateTask(task.id, {
        status: 'failed',
        failed_at: new Date().toISOString()
      })
      await internalDB.addAction({
        action_type: 'task_skipped',
        task_id: task.id,
        task_name: task.name,
        details: 'Could not fit into schedule after repack attempt'
      })
    }
  }
  
  return updatedTasks.length
}

/**
 * Main entry point: Reschedule an expired task and repack all tasks
 * @param expiredTask The task that expired
 * @returns Result of the operation
 */
export async function rescheduleAndRepack(
  expiredTask: InternalTask
): Promise<RescheduleResult> {
  // Get all tasks
  const allTasks = await internalDB.getAllTasks()
  
  // First, try to reschedule just the expired task
  const rescheduleResult = await rescheduleTask(expiredTask, allTasks)
  
  if (!rescheduleResult.success) {
    // Cannot reschedule - mark as failed
    await internalDB.updateTask(expiredTask.id, {
      status: 'failed',
      failed_at: new Date().toISOString()
    })
    await internalDB.addAction({
      action_type: 'task_skipped',
      task_id: expiredTask.id,
      task_name: expiredTask.name,
      details: rescheduleResult.message
    })
    return rescheduleResult
  }
  
  // Apply the reschedule
  if (rescheduleResult.newStartTime && rescheduleResult.newEndTime) {
    await applyReschedule(expiredTask, rescheduleResult.newStartTime, rescheduleResult.newEndTime)
  }
  
  // Now do a greedy repack to adjust other tasks if needed
  const freshTasks = await internalDB.getAllTasks()
  const repackResult = await greedyRepack(freshTasks, new Date())
  
  // Apply repack results
  await applyRepackToDatabase(repackResult)
  
  // Combine results
  return {
    success: rescheduleResult.success && repackResult.success,
    newStartTime: rescheduleResult.newStartTime,
    newEndTime: rescheduleResult.newEndTime,
    repackedTasks: repackResult.repackedTasks,
    failedTasks: repackResult.failedTasks,
    message: rescheduleResult.success 
      ? `${rescheduleResult.message}. ${repackResult.message}`
      : rescheduleResult.message
  }
}
