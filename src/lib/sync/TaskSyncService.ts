/**
 * Task Sync Service
 *
 * Syncs tasks from Supabase task_solution table to internalDB
 * Similar to web app's sync approach
 */

import { supabase } from '../supabase';
import { internalDB, InternalDB, InternalTask } from '../internal-db';

// Epoch reference date (same as web app)
const EPOCH = new Date('2020-01-01T00:00:00Z');
const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Sync lock to prevent concurrent syncs
let isSyncing = false;
let lastSyncTime = 0;
const MIN_SYNC_INTERVAL = 2000; // Minimum 2 seconds between syncs

/**
 * Convert interval number to timestamp
 * @param intervalNum - Interval number
 * @returns ISO timestamp string
 */
function n2dt(intervalNum: number): string {
  const intervalMs = 5 * 60 * 1000; // 5 minutes
  const date = new Date(EPOCH.getTime() + intervalNum * intervalMs);
  return date.toISOString();
}

/**
 * Sync tasks from Supabase to internalDB
 * Fetches current model, then task_solution, then syncs to local storage
 * Also checks for newer models if current model has no solutions
 * 
 * Includes deduplication and sync locking to prevent duplicate tasks
 */
export async function syncTasksFromSupabase(): Promise<{ success: boolean; taskCount: number; error?: string }> {
  // Prevent concurrent syncs
  if (isSyncing) {
    console.log('[TaskSync] Sync already in progress, skipping...');
    return { success: false, taskCount: 0, error: 'Sync already in progress' };
  }

  // Throttle syncs to prevent too frequent calls
  const now = Date.now();
  if (now - lastSyncTime < MIN_SYNC_INTERVAL) {
    console.log('[TaskSync] Sync throttled, too soon since last sync');
    return { success: false, taskCount: 0, error: 'Sync throttled' };
  }

  isSyncing = true;
  lastSyncTime = now;

  try {
    console.log('[TaskSync] Starting task sync from Supabase...');

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.log('[TaskSync] No authenticated user');
      return { success: false, taskCount: 0, error: 'Not authenticated' };
    }

    // Step 1: Get current model ID
    const { data: currentModel, error: modelError } = await supabase
      .from('current_model')
      .select('model_id')
      .eq('user_id', user.id)
      .single();

    if (modelError || !currentModel) {
      console.log('[TaskSync] No current model found:', modelError?.message);
      return { success: false, taskCount: 0, error: 'No current model' };
    }

    let modelId = currentModel.model_id;
    console.log('[TaskSync] Current model ID:', modelId);

    // Step 1.5: Check if current model has solutions, if not, check for newer models
    const { data: currentSolutions, error: currentSolutionsError } = await supabase
      .from('task_solution')
      .select('task_id')
      .eq('model_id', modelId)
      .limit(1);

    if (!currentSolutionsError && (!currentSolutions || currentSolutions.length === 0)) {
      // Current model has no solutions, check for newer models
      console.log('[TaskSync] Current model has no solutions, checking for newer models...');
      const { data: recentModels, error: modelsError } = await supabase
        .from('model')
        .select('model_id, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5); // Check last 5 models

      if (!modelsError && recentModels && recentModels.length > 0) {
        // Try each model until we find one with solutions
        for (const model of recentModels) {
          const { data: solutions, error: checkError } = await supabase
            .from('task_solution')
            .select('task_id')
            .eq('model_id', model.model_id)
            .limit(1);

          if (!checkError && solutions && solutions.length > 0) {
            console.log(`[TaskSync] Found solutions in model ${model.model_id} (created ${model.created_at})`);
            modelId = model.model_id;
            break;
          }
        }
      }
    }

    // Step 2: Fetch task solutions
    console.log(`[TaskSync] Fetching task solutions for model: ${modelId}`);
    const { data: taskSolutions, error: solutionsError } = await supabase
      .from('task_solution')
      .select('task_id, solution_json')
      .eq('model_id', modelId);

    if (solutionsError) {
      console.error('[TaskSync] Error fetching task solutions:', solutionsError);
      return { success: false, taskCount: 0, error: solutionsError.message };
    }

    if (!taskSolutions || taskSolutions.length === 0) {
      console.log(`[TaskSync] No task solutions found for model ${modelId} - solver may still be processing`);
      return { success: true, taskCount: 0 };
    }

    console.log(`[TaskSync] Found ${taskSolutions.length} task solutions in model ${modelId}`);

    // Step 3: Fetch task details
    const taskIds = taskSolutions.map(ts => ts.task_id);
    const { data: tasks, error: tasksError } = await supabase
      .from('task')
      .select('task_id, name, task_type, rules')
      .in('task_id', taskIds);

    if (tasksError) {
      console.error('[TaskSync] Error fetching tasks:', tasksError);
      return { success: false, taskCount: 0, error: tasksError.message };
    }

    const taskMap = new Map(tasks?.map(t => [t.task_id, t]) || []);

    // Step 4: Get existing tasks from internalDB to check for duplicates
    const existingTasks = await internalDB.getAllTasks();
    const existingTaskIds = new Set(existingTasks.map(t => t.id));

    // Step 5: Convert task solutions to InternalTask format and save
    // Only sync tasks that don't already exist (deduplication)
    let syncedCount = 0;
    let skippedCount = 0;
    
    // Use a Set to track task_ids we've already processed in this sync
    const processedTaskIds = new Set<string>();
    
    for (const ts of taskSolutions) {
      // Skip if we've already processed this task_id in this sync
      if (processedTaskIds.has(ts.task_id)) {
        console.log(`[TaskSync] Skipping duplicate task_id in same sync: ${ts.task_id}`);
        skippedCount++;
        continue;
      }
      processedTaskIds.add(ts.task_id);

      const task = taskMap.get(ts.task_id);
      if (!task) {
        console.warn('[TaskSync] Task not found for task_id:', ts.task_id);
        continue;
      }

      const solution = ts.solution_json as any;
      if (!solution || !solution.start || !solution.end) {
        console.warn('[TaskSync] Task solution missing start/end:', ts.task_id);
        continue;
      }

      // Convert interval numbers to timestamps
      const startInterval = parseInt(solution.start, 10);
      const endInterval = parseInt(solution.end, 10);
      const startTime = n2dt(startInterval);
      const endTime = n2dt(endInterval);

      // Check if task already exists in internalDB
      const existingTask = existingTasks.find(t => t.id === ts.task_id);
      
      // Only create new task if it doesn't exist, otherwise update existing one
      const internalTask: InternalTask = {
        id: ts.task_id,
        name: task.name || 'Unnamed Task',
        status: (solution.status === 'OPTIMAL' || solution.status === 'scheduled') ? 'pending' : 'pending',
        start_time: startTime,
        end_time: endTime,
        duration: InternalDB.calculateDuration(startTime, endTime),
        priority: 'medium',
        // Preserve original created_at if task already exists
        created_at: existingTask?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: existingTask?.completed_at || null,
      };

      // saveTask will upsert, but we log whether it's new or existing
      const wasExisting = existingTaskIds.has(ts.task_id);
      await internalDB.saveTask(internalTask);
      
      if (wasExisting) {
        console.log(`[TaskSync] Updated existing task: ${internalTask.name} (${ts.task_id})`);
      } else {
        console.log(`[TaskSync] Added new task: ${internalTask.name} (${ts.task_id})`);
        syncedCount++;
      }
    }

    console.log(`[TaskSync] Sync complete: ${syncedCount} new tasks, ${skippedCount} duplicates skipped`);
    return { success: true, taskCount: syncedCount };

  } catch (error: any) {
    console.error('[TaskSync] Error syncing tasks:', error);
    return { success: false, taskCount: 0, error: error.message };
  } finally {
    // Always release the sync lock
    isSyncing = false;
  }
}

