// Mock data generator for tasks
import { Task } from './internal-db'

export interface MockTaskTemplate {
  name: string
  duration: number // in minutes
  priority: 'low' | 'medium' | 'high'
  category: 'work' | 'personal' | 'health' | 'learning'
}

const MOCK_TASK_TEMPLATES: MockTaskTemplate[] = [
  // Work tasks
  { name: 'Check emails', duration: 15, priority: 'medium', category: 'work' },
  { name: 'Daily standup meeting', duration: 30, priority: 'high', category: 'work' },
  { name: 'Review code changes', duration: 45, priority: 'medium', category: 'work' },
  { name: 'Update project documentation', duration: 60, priority: 'low', category: 'work' },
  { name: 'Plan sprint backlog', duration: 90, priority: 'high', category: 'work' },
  { name: 'Client call', duration: 60, priority: 'high', category: 'work' },
  
  // Personal tasks
  { name: 'Grocery shopping', duration: 45, priority: 'medium', category: 'personal' },
  { name: 'Call parents', duration: 20, priority: 'medium', category: 'personal' },
  { name: 'Pay bills', duration: 15, priority: 'high', category: 'personal' },
  { name: 'Clean apartment', duration: 90, priority: 'low', category: 'personal' },
  { name: 'Laundry', duration: 30, priority: 'low', category: 'personal' },
  
  // Health tasks
  { name: 'Morning workout', duration: 45, priority: 'high', category: 'health' },
  { name: 'Meditation', duration: 15, priority: 'medium', category: 'health' },
  { name: 'Prepare healthy lunch', duration: 30, priority: 'medium', category: 'health' },
  { name: 'Evening walk', duration: 30, priority: 'low', category: 'health' },
  { name: 'Doctor appointment', duration: 60, priority: 'high', category: 'health' },
  
  // Learning tasks
  { name: 'Read technical articles', duration: 30, priority: 'medium', category: 'learning' },
  { name: 'Complete online course module', duration: 60, priority: 'medium', category: 'learning' },
  { name: 'Practice coding exercises', duration: 45, priority: 'low', category: 'learning' },
  { name: 'Watch conference talks', duration: 30, priority: 'low', category: 'learning' },
]

export class MockTaskGenerator {
  private static instance: MockTaskGenerator
  private currentTaskId = 1

  static getInstance(): MockTaskGenerator {
    if (!MockTaskGenerator.instance) {
      MockTaskGenerator.instance = new MockTaskGenerator()
    }
    return MockTaskGenerator.instance
  }

  private generateId(): string {
    return `mock-task-${this.currentTaskId++}`
  }

  /**
   * Generate a mock task based on a template
   */
  private createTaskFromTemplate(template: MockTaskTemplate, startTime: Date): Task {
    const endTime = new Date(startTime.getTime() + template.duration * 60 * 1000)
    
    return {
      id: this.generateId(),
      local_id: this.generateId(),
      user_id: 'internal_user',
      name: template.name,
      status: 'pending',
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      priority: template.priority,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      completed_at: null,
      sync_status: 'synced'
    }
  }

  /**
   * Generate a realistic daily schedule of tasks
   */
  generateDailySchedule(startDate: Date = new Date()): Task[] {
    const tasks: Task[] = []
    
    // Start at 8 AM
    const currentTime = new Date(startDate)
    currentTime.setHours(8, 0, 0, 0)
    
    // Generate 6-8 tasks throughout the day
    const numTasks = Math.floor(Math.random() * 3) + 6 // 6-8 tasks
    
    // Select random templates
    const selectedTemplates = this.selectRandomTemplates(numTasks)
    
    for (const template of selectedTemplates) {
      const task = this.createTaskFromTemplate(template, new Date(currentTime))
      tasks.push(task)
      
      // Move to next task time (add task duration + 15-30 min break)
      const taskDuration = template.duration * 60 * 1000
      const breakDuration = (Math.floor(Math.random() * 16) + 15) * 60 * 1000 // 15-30 min break
      currentTime.setTime(currentTime.getTime() + taskDuration + breakDuration)
      
      // Don't schedule tasks past 9 PM
      if (currentTime.getHours() >= 21) {
        break
      }
    }
    
    return tasks
  }

  /**
   * Generate a mixed schedule with some tasks already started/completed
   */
  generateMixedStatusSchedule(startDate: Date = new Date()): Task[] {
    const tasks = this.generateDailySchedule(startDate)
    const now = new Date()
    
    // Set realistic statuses based on current time
    tasks.forEach(task => {
      const taskStart = new Date(task.start_time!)
      const taskEnd = new Date(task.end_time!)
      
      if (taskEnd < now) {
        // Past tasks - 80% completed, 20% pending (missed)
        if (Math.random() < 0.8) {
          task.status = 'completed'
          task.completed_at = taskEnd.toISOString()
        }
      } else if (taskStart <= now && taskEnd > now) {
        // Current task - mark as in progress
        task.status = 'in_progress'
      }
      // Future tasks remain 'pending'
    })
    
    return tasks
  }

  /**
   * Select random templates ensuring variety
   */
  private selectRandomTemplates(count: number): MockTaskTemplate[] {
    const templates = [...MOCK_TASK_TEMPLATES]
    const selected: MockTaskTemplate[] = []
    
    // Ensure we have at least one from each category if possible
    const categories = ['work', 'personal', 'health', 'learning']
    const categoryCounts = { work: 0, personal: 0, health: 0, learning: 0 }
    
    while (selected.length < count && templates.length > 0) {
      const randomIndex = Math.floor(Math.random() * templates.length)
      const template = templates.splice(randomIndex, 1)[0]
      
      // Favor variety in categories
      if (categoryCounts[template.category] < 2 || selected.length > count * 0.7) {
        selected.push(template)
        categoryCounts[template.category]++
      } else if (templates.length === 0) {
        // If we run out of templates, just add it
        selected.push(template)
      }
    }
    
    return selected
  }

  /**
   * Add a custom task to the mix
   */
  createCustomTask(name: string, duration: number, startTime: Date): Task {
    const template: MockTaskTemplate = {
      name,
      duration,
      priority: 'medium',
      category: 'work'
    }
    
    return this.createTaskFromTemplate(template, startTime)
  }

  /**
   * Generate tasks for the next few days
   */
  generateWeekSchedule(): Task[] {
    const allTasks: Task[] = []
    const today = new Date()
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(today)
      date.setDate(date.getDate() + i)
      
      if (i === 0) {
        // Today - mixed statuses
        allTasks.push(...this.generateMixedStatusSchedule(date))
      } else {
        // Future days - all pending
        allTasks.push(...this.generateDailySchedule(date))
      }
    }
    
    return allTasks
  }
}

// Export singleton instance
export const mockTaskGenerator = MockTaskGenerator.getInstance()