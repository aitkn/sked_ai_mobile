export interface Task {
  task_id: string
  user_id: string
  task_type?: string | null
  is_top?: number // 0/1
  task_group_id?: string | null
  created_at?: string
  new_field?: string | null
}

export interface Entity {
  entity_id: string
  user_id: string
  is_person?: number // 0/1
  created_at?: string
}

export interface InternalTaskRecord {
  id: string
  name: string
  start_time: string
  end_time: string
  duration: number
  status: 'pending' | 'in_progress' | 'completed' | 'paused' | 'cancelled'
  priority: 'low' | 'medium' | 'high'
  completed_at?: string | null
  paused_at?: string | null
  cancelled_at?: string | null
  created_at: string
  updated_at: string
}

export interface InternalActionRecord {
  id: string
  action_type: 'task_started' | 'task_completed' | 'task_skipped' | 'task_paused' | 'task_cancelled' | 'task_resumed'
  task_id: string
  task_name: string
  timestamp: string
  details?: string | null
}



