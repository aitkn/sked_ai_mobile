import { Task } from './internal-db'

export interface TimelineEntry {
  time: string // "9:00" or "14:30"
  duration: number // minutes
  name: string
  priority?: 'low' | 'medium' | 'high'
  status?: 'pending' | 'completed' | 'in_progress'
}

export interface DayTimeline {
  [day: string]: TimelineEntry[]
}

// Timeline without gym/fitness activities - typical work week
export const timelineWithoutGym: DayTimeline = {
  Monday: [
    { time: "8:30", duration: 30, name: "Morning Coffee & Email Review", priority: "low" },
    { time: "9:00", duration: 30, name: "Team Standup", priority: "high" },
    { time: "10:00", duration: 90, name: "Sprint Planning Meeting", priority: "high" },
    { time: "12:00", duration: 60, name: "Lunch with Sarah", priority: "low" },
    { time: "14:00", duration: 60, name: "Design Review Session", priority: "medium" },
    { time: "15:30", duration: 120, name: "Feature Development", priority: "high" },
    { time: "18:00", duration: 45, name: "Grocery Shopping", priority: "medium" }
  ],
  Tuesday: [
    { time: "8:00", duration: 45, name: "Email & Slack Catchup", priority: "low" },
    { time: "9:00", duration: 30, name: "1:1 with Team Lead", priority: "high" },
    { time: "10:00", duration: 120, name: "Client Presentation Prep", priority: "high" },
    { time: "12:30", duration: 45, name: "Quick Lunch", priority: "low" },
    { time: "13:30", duration: 180, name: "API Development Sprint", priority: "high" },
    { time: "17:00", duration: 60, name: "Dentist Appointment", priority: "medium" },
    { time: "19:00", duration: 90, name: "Dinner with Parents", priority: "medium" }
  ],
  Wednesday: [
    { time: "8:30", duration: 30, name: "Morning Planning", priority: "medium" },
    { time: "9:00", duration: 30, name: "Team Standup", priority: "high" },
    { time: "9:30", duration: 120, name: "Bug Fixing Session", priority: "high" },
    { time: "12:00", duration: 60, name: "Team Lunch", priority: "low" },
    { time: "13:30", duration: 60, name: "Product Demo to Stakeholders", priority: "high" },
    { time: "15:00", duration: 90, name: "Code Review & Refactoring", priority: "medium" },
    { time: "17:30", duration: 120, name: "Team Happy Hour", priority: "low" }
  ],
  Thursday: [
    { time: "8:00", duration: 60, name: "Deep Work - No Meetings", priority: "high" },
    { time: "9:00", duration: 180, name: "Quarterly Planning Workshop", priority: "high" },
    { time: "12:00", duration: 60, name: "Lunch & Learn: New Tech Stack", priority: "medium" },
    { time: "14:00", duration: 60, name: "Performance Review with Manager", priority: "high" },
    { time: "15:30", duration: 120, name: "Feature Development", priority: "high" },
    { time: "18:00", duration: 30, name: "Pick up Dry Cleaning", priority: "low" },
    { time: "19:00", duration: 90, name: "Book Club Meeting", priority: "low" }
  ],
  Friday: [
    { time: "8:00", duration: 30, name: "Coffee Run & Team Treats", priority: "low" },
    { time: "9:00", duration: 30, name: "Team Standup", priority: "high" },
    { time: "10:00", duration: 60, name: "Sprint Retrospective", priority: "high" },
    { time: "11:30", duration: 90, name: "Documentation & Cleanup", priority: "medium" },
    { time: "13:00", duration: 90, name: "Extended Team Lunch", priority: "low" },
    { time: "15:00", duration: 60, name: "Week Review & Next Week Planning", priority: "medium" },
    { time: "16:30", duration: 30, name: "Deploy to Staging", priority: "high" },
    { time: "18:00", duration: 180, name: "Happy Hour with Friends", priority: "low" }
  ],
  Saturday: [
    { time: "10:00", duration: 90, name: "Weekend Brunch at Cafe", priority: "low" },
    { time: "11:30", duration: 60, name: "Farmers Market", priority: "low" },
    { time: "14:00", duration: 120, name: "Home Improvement Project", priority: "medium" },
    { time: "17:00", duration: 60, name: "Meal Prep for Week", priority: "medium" },
    { time: "20:00", duration: 150, name: "Movie Night with Friends", priority: "low" }
  ],
  Sunday: [
    { time: "9:00", duration: 60, name: "Sleep In & Slow Morning", priority: "low" },
    { time: "11:00", duration: 120, name: "Visit Local Museum", priority: "low" },
    { time: "14:00", duration: 120, name: "Meal Prep & Kitchen Cleanup", priority: "medium" },
    { time: "16:30", duration: 90, name: "Reading & Relaxation", priority: "low" },
    { time: "18:00", duration: 120, name: "Family Dinner", priority: "medium" }
  ]
}

// Function to import timeline into tasks
export function importTimelineToTasks(
  timeline: DayTimeline,
  startFromToday: boolean = true
): Task[] {
  const tasks: Task[] = []
  const now = new Date()
  
  // Calculate the start of the week - for demo, always start from next Monday
  const startDate = new Date(now)
  const day = startDate.getDay()
  const daysUntilNextMonday = day === 0 ? 1 : 8 - day
  startDate.setDate(startDate.getDate() + daysUntilNextMonday)
  startDate.setHours(0, 0, 0, 0)

  const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  
  dayOrder.forEach((dayName, dayIndex) => {
    const dayEntries = timeline[dayName] || []
    const currentDate = new Date(startDate)
    currentDate.setDate(startDate.getDate() + dayIndex)
    
    dayEntries.forEach((entry, entryIndex) => {
      const [hours, minutes] = entry.time.split(':').map(Number)
      const startTime = new Date(currentDate)
      startTime.setHours(hours, minutes, 0, 0)
      
      const endTime = new Date(startTime.getTime() + entry.duration * 60 * 1000)
      
      // All tasks are pending since they're for next week
      let status: 'pending' | 'completed' | 'in_progress' = 'pending'
      if (entry.status) {
        status = entry.status
      }
      
      const taskId = `demo-${dayName.toLowerCase()}-${Date.now()}-${entryIndex}`
      
      const task: Task = {
        id: taskId,
        local_id: taskId,
        user_id: 'demo_user',
        name: entry.name,
        status,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        priority: entry.priority || 'medium',
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
        deleted_at: null,
        completed_at: status === 'completed' ? endTime.toISOString() : null,
        sync_status: 'synced' as const,
      }
      
      tasks.push(task)
    })
  })
  
  return tasks
}

// Timeline WITH your requirements: 8 hours sleep, morning/evening routines, 3 meals, gym 5x/week (morning), daily shower after gym
export const timelineWithGym: DayTimeline = {
  Monday: [
    { time: "6:00", duration: 30, name: "Morning Routine", priority: "high" },
    { time: "6:30", duration: 60, name: "Gym Session - Upper Body", priority: "high" },
    { time: "7:30", duration: 30, name: "Post-Workout Shower", priority: "medium" },
    { time: "8:00", duration: 30, name: "Breakfast", priority: "medium" },
    { time: "9:00", duration: 30, name: "Team Standup", priority: "high" },
    { time: "10:00", duration: 90, name: "Sprint Planning Meeting", priority: "high" },
    { time: "12:00", duration: 60, name: "Lunch", priority: "medium" },
    { time: "13:30", duration: 180, name: "Feature Development", priority: "high" },
    { time: "17:00", duration: 60, name: "Code Review Session", priority: "medium" },
    { time: "18:30", duration: 60, name: "Dinner", priority: "medium" },
    { time: "20:00", duration: 60, name: "Grocery Shopping", priority: "low" },
    { time: "21:30", duration: 30, name: "Evening Routine", priority: "medium" },
    { time: "22:00", duration: 480, name: "Sleep (8 hours)", priority: "high" }
  ],
  Tuesday: [
    { time: "6:00", duration: 30, name: "Morning Routine", priority: "high" },
    { time: "6:30", duration: 60, name: "Gym Session - Lower Body", priority: "high" },
    { time: "7:30", duration: 30, name: "Post-Workout Shower", priority: "medium" },
    { time: "8:00", duration: 30, name: "Breakfast", priority: "medium" },
    { time: "9:00", duration: 30, name: "1:1 with Team Lead", priority: "high" },
    { time: "10:00", duration: 120, name: "Client Presentation Prep", priority: "high" },
    { time: "12:00", duration: 60, name: "Lunch", priority: "medium" },
    { time: "13:30", duration: 180, name: "API Development Sprint", priority: "high" },
    { time: "17:00", duration: 60, name: "Dentist Appointment", priority: "medium" },
    { time: "18:30", duration: 60, name: "Dinner", priority: "medium" },
    { time: "20:00", duration: 90, name: "Family Time", priority: "medium" },
    { time: "21:30", duration: 30, name: "Evening Routine", priority: "medium" },
    { time: "22:00", duration: 480, name: "Sleep (8 hours)", priority: "high" }
  ],
  Wednesday: [
    { time: "6:00", duration: 30, name: "Morning Routine", priority: "high" },
    { time: "6:30", duration: 60, name: "Gym Session - Cardio", priority: "high" },
    { time: "7:30", duration: 30, name: "Post-Workout Shower", priority: "medium" },
    { time: "8:00", duration: 30, name: "Breakfast", priority: "medium" },
    { time: "9:00", duration: 30, name: "Team Standup", priority: "high" },
    { time: "10:00", duration: 120, name: "Bug Fixing Session", priority: "high" },
    { time: "12:00", duration: 60, name: "Lunch", priority: "medium" },
    { time: "13:30", duration: 90, name: "Product Demo to Stakeholders", priority: "high" },
    { time: "15:30", duration: 90, name: "Code Review & Refactoring", priority: "medium" },
    { time: "17:30", duration: 120, name: "Team Happy Hour", priority: "low" },
    { time: "19:30", duration: 60, name: "Dinner", priority: "medium" },
    { time: "21:30", duration: 30, name: "Evening Routine", priority: "medium" },
    { time: "22:00", duration: 480, name: "Sleep (8 hours)", priority: "high" }
  ],
  Thursday: [
    { time: "6:00", duration: 30, name: "Morning Routine", priority: "high" },
    { time: "6:30", duration: 60, name: "Gym Session - Full Body", priority: "high" },
    { time: "7:30", duration: 30, name: "Post-Workout Shower", priority: "medium" },
    { time: "8:00", duration: 30, name: "Breakfast", priority: "medium" },
    { time: "9:00", duration: 180, name: "Quarterly Planning Workshop", priority: "high" },
    { time: "12:00", duration: 60, name: "Lunch & Learn: New Tech Stack", priority: "medium" },
    { time: "13:30", duration: 90, name: "Performance Review with Manager", priority: "high" },
    { time: "15:30", duration: 120, name: "Feature Development", priority: "high" },
    { time: "18:00", duration: 30, name: "Pick up Dry Cleaning", priority: "low" },
    { time: "19:00", duration: 60, name: "Dinner", priority: "medium" },
    { time: "20:30", duration: 90, name: "Book Club Meeting", priority: "low" },
    { time: "22:00", duration: 480, name: "Sleep (8 hours)", priority: "high" }
  ],
  Friday: [
    { time: "6:00", duration: 30, name: "Morning Routine", priority: "high" },
    { time: "6:30", duration: 60, name: "Gym Session - Yoga/Stretching", priority: "high" },
    { time: "7:30", duration: 30, name: "Post-Workout Shower", priority: "medium" },
    { time: "8:00", duration: 30, name: "Breakfast", priority: "medium" },
    { time: "9:00", duration: 30, name: "Team Standup", priority: "high" },
    { time: "10:00", duration: 60, name: "Sprint Retrospective", priority: "high" },
    { time: "11:30", duration: 90, name: "Documentation & Cleanup", priority: "medium" },
    { time: "13:00", duration: 60, name: "Lunch", priority: "medium" },
    { time: "14:30", duration: 90, name: "Week Review & Next Week Planning", priority: "medium" },
    { time: "16:15", duration: 30, name: "Deploy to Staging", priority: "high" },
    { time: "18:00", duration: 60, name: "Dinner", priority: "medium" },
    { time: "19:30", duration: 180, name: "Happy Hour with Friends", priority: "low" },
    { time: "22:30", duration: 30, name: "Evening Routine", priority: "medium" },
    { time: "23:00", duration: 420, name: "Sleep (7 hours - weekend prep)", priority: "high" }
  ],
  Saturday: [
    { time: "6:00", duration: 480, name: "Sleep (8 hours on weekend)", priority: "high" },
    { time: "8:00", duration: 30, name: "Morning Routine", priority: "medium" },
    { time: "8:30", duration: 30, name: "Morning Shower", priority: "medium" },
    { time: "9:00", duration: 30, name: "Breakfast", priority: "medium" },
    { time: "10:00", duration: 90, name: "Weekend Brunch at Cafe", priority: "low" },
    { time: "11:30", duration: 60, name: "Farmers Market", priority: "low" },
    { time: "13:00", duration: 60, name: "Lunch", priority: "medium" },
    { time: "14:30", duration: 120, name: "Home Improvement Project", priority: "medium" },
    { time: "17:00", duration: 60, name: "Meal Prep for Week", priority: "medium" },
    { time: "19:00", duration: 60, name: "Dinner", priority: "medium" },
    { time: "20:30", duration: 150, name: "Movie Night with Friends", priority: "low" },
    { time: "23:00", duration: 30, name: "Evening Routine", priority: "medium" },
    { time: "23:30", duration: 450, name: "Sleep (7.5 hours)", priority: "high" }
  ],
  Sunday: [
    { time: "7:00", duration: 60, name: "Sleep In & Slow Morning", priority: "low" },
    { time: "8:00", duration: 30, name: "Morning Routine", priority: "medium" },
    { time: "8:30", duration: 30, name: "Morning Shower", priority: "medium" },
    { time: "9:00", duration: 30, name: "Breakfast", priority: "medium" },
    { time: "10:00", duration: 120, name: "Visit Local Museum", priority: "low" },
    { time: "12:30", duration: 60, name: "Lunch", priority: "medium" },
    { time: "14:00", duration: 120, name: "Meal Prep & Kitchen Cleanup", priority: "medium" },
    { time: "16:30", duration: 90, name: "Reading & Relaxation", priority: "low" },
    { time: "18:00", duration: 120, name: "Family Dinner", priority: "medium" },
    { time: "20:30", duration: 90, name: "Sunday Planning & Prep", priority: "medium" },
    { time: "22:00", duration: 480, name: "Sleep (8 hours)", priority: "high" }
  ]
}

// Minimal timeline - ONLY the 5 core essentials you requested
export const pureLifestyleTimeline: DayTimeline = {
  Monday: [
    { time: "6:00", duration: 30, name: "Morning Routine", priority: "high" },
    { time: "6:30", duration: 60, name: "Gym Session - Upper Body", priority: "high" },
    { time: "7:30", duration: 30, name: "Post-Workout Shower", priority: "medium" },
    { time: "8:00", duration: 30, name: "Breakfast", priority: "medium" },
    { time: "12:00", duration: 60, name: "Lunch", priority: "medium" },
    { time: "18:30", duration: 60, name: "Dinner", priority: "medium" },
    { time: "21:30", duration: 30, name: "Evening Routine", priority: "medium" },
    { time: "22:00", duration: 480, name: "Sleep (8 hours)", priority: "high" }
  ],
  Tuesday: [
    { time: "6:00", duration: 30, name: "Morning Routine", priority: "high" },
    { time: "6:30", duration: 60, name: "Gym Session - Lower Body", priority: "high" },
    { time: "7:30", duration: 30, name: "Post-Workout Shower", priority: "medium" },
    { time: "8:00", duration: 30, name: "Breakfast", priority: "medium" },
    { time: "12:00", duration: 60, name: "Lunch", priority: "medium" },
    { time: "18:30", duration: 60, name: "Dinner", priority: "medium" },
    { time: "21:30", duration: 30, name: "Evening Routine", priority: "medium" },
    { time: "22:00", duration: 480, name: "Sleep (8 hours)", priority: "high" }
  ],
  Wednesday: [
    { time: "6:00", duration: 30, name: "Morning Routine", priority: "high" },
    { time: "6:30", duration: 60, name: "Gym Session - Cardio", priority: "high" },
    { time: "7:30", duration: 30, name: "Post-Workout Shower", priority: "medium" },
    { time: "8:00", duration: 30, name: "Breakfast", priority: "medium" },
    { time: "12:00", duration: 60, name: "Lunch", priority: "medium" },
    { time: "18:30", duration: 60, name: "Dinner", priority: "medium" },
    { time: "21:30", duration: 30, name: "Evening Routine", priority: "medium" },
    { time: "22:00", duration: 480, name: "Sleep (8 hours)", priority: "high" }
  ],
  Thursday: [
    { time: "6:00", duration: 30, name: "Morning Routine", priority: "high" },
    { time: "6:30", duration: 60, name: "Gym Session - Full Body", priority: "high" },
    { time: "7:30", duration: 30, name: "Post-Workout Shower", priority: "medium" },
    { time: "8:00", duration: 30, name: "Breakfast", priority: "medium" },
    { time: "12:00", duration: 60, name: "Lunch", priority: "medium" },
    { time: "18:30", duration: 60, name: "Dinner", priority: "medium" },
    { time: "21:30", duration: 30, name: "Evening Routine", priority: "medium" },
    { time: "22:00", duration: 480, name: "Sleep (8 hours)", priority: "high" }
  ],
  Friday: [
    { time: "6:00", duration: 30, name: "Morning Routine", priority: "high" },
    { time: "6:30", duration: 60, name: "Gym Session - Yoga/Stretching", priority: "high" },
    { time: "7:30", duration: 30, name: "Post-Workout Shower", priority: "medium" },
    { time: "8:00", duration: 30, name: "Breakfast", priority: "medium" },
    { time: "12:00", duration: 60, name: "Lunch", priority: "medium" },
    { time: "18:30", duration: 60, name: "Dinner", priority: "medium" },
    { time: "21:30", duration: 30, name: "Evening Routine", priority: "medium" },
    { time: "22:00", duration: 480, name: "Sleep (8 hours)", priority: "high" }
  ],
  Saturday: [
    { time: "8:00", duration: 30, name: "Morning Routine", priority: "medium" },
    { time: "8:30", duration: 30, name: "Morning Shower", priority: "medium" },
    { time: "9:00", duration: 60, name: "Breakfast", priority: "medium" },
    { time: "13:00", duration: 60, name: "Lunch", priority: "medium" },
    { time: "18:00", duration: 60, name: "Dinner", priority: "medium" },
    { time: "21:30", duration: 30, name: "Evening Routine", priority: "medium" },
    { time: "22:00", duration: 480, name: "Sleep (8 hours)", priority: "high" }
  ],
  Sunday: [
    { time: "8:00", duration: 30, name: "Morning Routine", priority: "medium" },
    { time: "8:30", duration: 30, name: "Morning Shower", priority: "medium" },
    { time: "9:00", duration: 60, name: "Breakfast", priority: "medium" },
    { time: "13:00", duration: 60, name: "Lunch", priority: "medium" },
    { time: "18:00", duration: 60, name: "Dinner", priority: "medium" },
    { time: "21:30", duration: 30, name: "Evening Routine", priority: "medium" },
    { time: "22:00", duration: 480, name: "Sleep (8 hours)", priority: "high" }
  ]
}

// Function to import timeline into tasks for multiple weeks (recurring schedule)
export function importRecurringTimelineToTasks(
  timeline: DayTimeline,
  numberOfWeeks: number = 4,
  startFromToday: boolean = true
): Task[] {
  const tasks: Task[] = []
  const now = new Date()
  
  // Calculate the start of the week - for demo, always start from next Monday
  const startDate = new Date(now)
  const day = startDate.getDay()
  const daysUntilNextMonday = day === 0 ? 1 : 8 - day
  startDate.setDate(startDate.getDate() + daysUntilNextMonday)
  startDate.setHours(0, 0, 0, 0)

  const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  
  // Generate tasks for multiple weeks
  for (let weekNumber = 0; weekNumber < numberOfWeeks; weekNumber++) {
    const weekStartDate = new Date(startDate)
    weekStartDate.setDate(startDate.getDate() + (weekNumber * 7))
    
    dayOrder.forEach((dayName, dayIndex) => {
      const dayEntries = timeline[dayName] || []
      const currentDate = new Date(weekStartDate)
      currentDate.setDate(weekStartDate.getDate() + dayIndex)
      
      dayEntries.forEach((entry, entryIndex) => {
        const [hours, minutes] = entry.time.split(':').map(Number)
        const startTime = new Date(currentDate)
        startTime.setHours(hours, minutes, 0, 0)
        
        const endTime = new Date(startTime.getTime() + entry.duration * 60 * 1000)
        
        // All tasks are pending since they're for future weeks
        let status: 'pending' | 'completed' | 'in_progress' = 'pending'
        if (entry.status) {
          status = entry.status
        }
        
        const taskId = `demo-week${weekNumber + 1}-${dayName.toLowerCase()}-${Date.now()}-${entryIndex}`
        
        const task: Task = {
          id: taskId,
          local_id: taskId,
          user_id: 'demo_user',
          name: entry.name,
          status,
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          priority: entry.priority || 'medium',
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
          deleted_at: null,
          completed_at: status === 'completed' ? endTime.toISOString() : null,
          sync_status: 'synced' as const,
        }
        
        tasks.push(task)
      })
    })
  }
  
  return tasks
}

// Helper function to clear existing demo tasks
export function clearDemoTasks(tasks: Task[]): Task[] {
  return tasks.filter(task => !task.id.startsWith('demo-'))
}

// Helper function to add shower tasks intelligently
export function addShowerTasksToSchedule(existingTasks: Task[]): Task[] {
  const tasksWithShowers: Task[] = [...existingTasks]
  const now = new Date()
  
  // Group tasks by day
  const tasksByDay = new Map<string, Task[]>()
  existingTasks.forEach(task => {
    const taskDate = new Date(task.start_time)
    const dayKey = taskDate.toDateString()
    if (!tasksByDay.has(dayKey)) {
      tasksByDay.set(dayKey, [])
    }
    tasksByDay.get(dayKey)!.push(task)
  })
  
  // For each day, add a shower task
  tasksByDay.forEach((dayTasks, dayKey) => {
    const dayDate = new Date(dayKey)
    
    // Sort tasks by start time
    dayTasks.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    
    // Check if there's a gym session
    const gymTask = dayTasks.find(task => 
      task.name.toLowerCase().includes('gym') || 
      task.name.toLowerCase().includes('workout') ||
      task.name.toLowerCase().includes('yoga')
    )
    
    let showerTime: Date
    let insertAfterTask: Task | null = null
    
    if (gymTask) {
      // Schedule shower 15 minutes after gym ends
      const gymEndTime = new Date(gymTask.end_time)
      showerTime = new Date(gymEndTime.getTime() + 15 * 60 * 1000) // 15 minutes after gym
      insertAfterTask = gymTask
    } else {
      // No gym - schedule shower in the morning around 7:30 AM
      showerTime = new Date(dayDate)
      showerTime.setHours(7, 30, 0, 0)
      
      // If there's already a task at this time, find a gap
      const conflictingTask = dayTasks.find(task => {
        const taskStart = new Date(task.start_time).getTime()
        const taskEnd = new Date(task.end_time).getTime()
        const showerStart = showerTime.getTime()
        const showerEnd = showerStart + 30 * 60 * 1000 // 30 min shower
        return (showerStart >= taskStart && showerStart < taskEnd) || 
               (showerEnd > taskStart && showerEnd <= taskEnd)
      })
      
      if (conflictingTask) {
        // Schedule after the first task of the day
        showerTime = new Date(conflictingTask.end_time)
        showerTime = new Date(showerTime.getTime() + 15 * 60 * 1000) // 15 minutes after
      }
    }
    
    const showerEndTime = new Date(showerTime.getTime() + 30 * 60 * 1000) // 30 minute shower
    
    // Create shower task
    const showerTask: Task = {
      id: `demo-shower-${dayDate.getDay()}-${Date.now()}`,
      local_id: `demo-shower-${dayDate.getDay()}-${Date.now()}`,
      user_id: 'demo_user',
      name: gymTask ? 'Post-Workout Shower' : 'Morning Shower',
      status: 'pending',
      start_time: showerTime.toISOString(),
      end_time: showerEndTime.toISOString(),
      priority: 'medium',
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      deleted_at: null,
      completed_at: null,
      sync_status: 'synced' as const,
    }
    
    tasksWithShowers.push(showerTask)
  })
  
  // Sort all tasks by start time
  tasksWithShowers.sort((a, b) => 
    new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  )
  
  return tasksWithShowers
}

// Helper function to add business trip and running to weekend
export function addBusinessTripToWeekend(existingTasks: Task[]): Task[] {
  const updatedTasks: Task[] = []
  const now = new Date()
  
  // Keep weekday tasks unchanged
  existingTasks.forEach(task => {
    const taskDate = new Date(task.start_time)
    const dayOfWeek = taskDate.getDay()
    
    // Keep all non-weekend tasks (Monday = 1, Friday = 5)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      updatedTasks.push(task)
    }
  })
  
  // Get the Saturday and Sunday dates
  const startOfWeek = new Date(existingTasks[0].start_time)
  const saturday = new Date(startOfWeek)
  saturday.setDate(saturday.getDate() + (6 - startOfWeek.getDay() + 7) % 7)
  saturday.setHours(0, 0, 0, 0)
  
  const sunday = new Date(saturday)
  sunday.setDate(sunday.getDate() + 1)
  
  // Saturday schedule
  const saturdayTasks: Task[] = [
    {
      id: `demo-saturday-run-${Date.now()}`,
      local_id: `demo-saturday-run-${Date.now()}`,
      user_id: 'demo_user',
      name: 'Morning Run (Good Weather Window)',
      status: 'pending',
      start_time: new Date(saturday.setHours(7, 0, 0, 0)).toISOString(),
      end_time: new Date(saturday.setHours(8, 0, 0, 0)).toISOString(),
      priority: 'high',
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      deleted_at: null,
      completed_at: null,
      sync_status: 'synced' as const,
    },
    {
      id: `demo-saturday-breakfast-${Date.now()}`,
      local_id: `demo-saturday-breakfast-${Date.now()}`,
      user_id: 'demo_user',
      name: 'Quick Breakfast & Prep',
      status: 'pending',
      start_time: new Date(saturday.setHours(8, 15, 0, 0)).toISOString(),
      end_time: new Date(saturday.setHours(8, 45, 0, 0)).toISOString(),
      priority: 'low',
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      deleted_at: null,
      completed_at: null,
      sync_status: 'synced' as const,
    },
    {
      id: `demo-saturday-work-${Date.now()}`,
      local_id: `demo-saturday-work-${Date.now()}`,
      user_id: 'demo_user',
      name: 'Business Trip - Client Workshop',
      status: 'pending',
      start_time: new Date(saturday.setHours(9, 0, 0, 0)).toISOString(),
      end_time: new Date(saturday.setHours(17, 0, 0, 0)).toISOString(),
      priority: 'high',
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      deleted_at: null,
      completed_at: null,
      sync_status: 'synced' as const,
    },
    {
      id: `demo-saturday-dinner-${Date.now()}`,
      local_id: `demo-saturday-dinner-${Date.now()}`,
      user_id: 'demo_user',
      name: 'Team Dinner',
      status: 'pending',
      start_time: new Date(saturday.setHours(18, 30, 0, 0)).toISOString(),
      end_time: new Date(saturday.setHours(20, 30, 0, 0)).toISOString(),
      priority: 'medium',
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      deleted_at: null,
      completed_at: null,
      sync_status: 'synced' as const,
    }
  ]
  
  // Sunday schedule
  const sundayTasks: Task[] = [
    {
      id: `demo-sunday-run-${Date.now()}`,
      local_id: `demo-sunday-run-${Date.now()}`,
      user_id: 'demo_user',
      name: 'Morning Run (Good Weather Window)',
      status: 'pending',
      start_time: new Date(sunday.setHours(7, 0, 0, 0)).toISOString(),
      end_time: new Date(sunday.setHours(8, 0, 0, 0)).toISOString(),
      priority: 'high',
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      deleted_at: null,
      completed_at: null,
      sync_status: 'synced' as const,
    },
    {
      id: `demo-sunday-breakfast-${Date.now()}`,
      local_id: `demo-sunday-breakfast-${Date.now()}`,
      user_id: 'demo_user',
      name: 'Hotel Breakfast',
      status: 'pending',
      start_time: new Date(sunday.setHours(8, 15, 0, 0)).toISOString(),
      end_time: new Date(sunday.setHours(8, 45, 0, 0)).toISOString(),
      priority: 'low',
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      deleted_at: null,
      completed_at: null,
      sync_status: 'synced' as const,
    },
    {
      id: `demo-sunday-work-${Date.now()}`,
      local_id: `demo-sunday-work-${Date.now()}`,
      user_id: 'demo_user',
      name: 'Business Trip - Strategy Session',
      status: 'pending',
      start_time: new Date(sunday.setHours(9, 0, 0, 0)).toISOString(),
      end_time: new Date(sunday.setHours(17, 0, 0, 0)).toISOString(),
      priority: 'high',
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      deleted_at: null,
      completed_at: null,
      sync_status: 'synced' as const,
    },
    {
      id: `demo-sunday-travel-${Date.now()}`,
      local_id: `demo-sunday-travel-${Date.now()}`,
      user_id: 'demo_user',
      name: 'Travel Back Home',
      status: 'pending',
      start_time: new Date(sunday.setHours(17, 30, 0, 0)).toISOString(),
      end_time: new Date(sunday.setHours(20, 0, 0, 0)).toISOString(),
      priority: 'medium',
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      deleted_at: null,
      completed_at: null,
      sync_status: 'synced' as const,
    }
  ]
  
  // Add all tasks and sort by time
  updatedTasks.push(...saturdayTasks, ...sundayTasks)
  updatedTasks.sort((a, b) => 
    new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  )
  
  return updatedTasks
}