// Simple mock data for tasks without complex timeline sync
import { Task } from './internal-db'

export function generateSimpleMockTasks(useRandomTasks = false): Task[] {
  const now = new Date()
  const tasks: Task[] = []

  // Generate 3-5 tasks for today with realistic times
  const baseTaskTemplates = [
    { name: 'Check emails', duration: 15, status: 'completed' as const },
    { name: 'Team standup meeting', duration: 30, status: 'in_progress' as const },
    { name: 'Review pull requests', duration: 45, status: 'pending' as const },
    { name: 'Lunch break', duration: 60, status: 'pending' as const },
    { name: 'Work on project documentation', duration: 90, status: 'pending' as const },
  ]
  
  const randomTaskTemplates = [
    { name: 'Morning workout', duration: 45, status: 'completed' as const },
    { name: 'Client presentation', duration: 60, status: 'in_progress' as const },
    { name: 'Code review session', duration: 30, status: 'pending' as const },
    { name: 'Team brainstorming', duration: 75, status: 'pending' as const },
    { name: 'Update project timeline', duration: 45, status: 'pending' as const },
  ]
  
  const taskTemplates = useRandomTasks ? randomTaskTemplates : baseTaskTemplates

  let currentTime = new Date()
  currentTime.setHours(9, 0, 0, 0) // Start at 9 AM

  taskTemplates.forEach((template, index) => {
    const startTime = new Date(currentTime)
    const endTime = new Date(startTime.getTime() + template.duration * 60 * 1000)
    
    const task: Task = {
      id: `mock-${Date.now()}-${index + 1}`,
      local_id: `mock-${Date.now()}-${index + 1}`,
      user_id: 'internal_user',
      name: template.name,
      status: template.status,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      priority: 'medium',
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      deleted_at: null,
      completed_at: template.status === 'completed' ? endTime.toISOString() : null,
      sync_status: 'synced'
    }

    tasks.push(task)
    
    // Move to next task (add duration + 15 min buffer)
    currentTime.setTime(endTime.getTime() + 15 * 60 * 1000)
  })

  return tasks
}