# New User Setup Guide

## Known Issue: Tasks Not Appearing in Calendar

When a new user creates tasks via the chat, the tasks may not appear in the calendar even though they show as "created successfully." This is due to a location configuration issue with the solver engine.

### Root Cause

The SkedAI solver requires:
1. **Valid locations** - Every task must be linked to a `user_place_location` that has a valid `location_id`
2. **Entity location** - The user's entity must have an `entity_location` entry (so the solver knows where the user currently is)

For new users, these are not automatically set up, causing:
- `user_place_location.location_id = NULL`
- `entity_location` table has no entries for the user
- Solver returns empty solutions → Calendar shows nothing

### Symptoms

- Task appears in Supabase `task` table ✅
- Task appears in `scheduled_task` table ✅
- Model status shows "processed" ✅
- **BUT** `task_solution` table is empty ❌
- **AND** `solution` table is empty ❌
- Calendar shows no tasks ❌

### Temporary Fix (Required for Each New User)

Run these SQL commands in the **Supabase SQL Editor**, replacing `YOUR_USER_ID` and `YOUR_ENTITY_ID` with the actual values:

```sql
-- Step 1: Find your user_id and entity_id
-- Run this first to get the IDs:
SELECT 
  u.user_id,
  e.entity_id,
  e.name as entity_name
FROM "user" u
LEFT JOIN entity e ON e.user_id = u.user_id
WHERE u.email = 'YOUR_EMAIL@example.com';

-- Step 2: Create a default "Home" location (run once per database)
INSERT INTO location (
  location_id,
  country_code,
  location,
  timezone,
  city,
  state_province
) VALUES (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'US',
  ST_SetSRID(ST_MakePoint(-122.2727, 37.8716), 4326),
  'America/Los_Angeles',
  'Berkeley',
  'California'
) ON CONFLICT (location_id) DO NOTHING;

-- Step 3: Create "Home" user_place_location for the user
INSERT INTO user_place_location (
  user_location_id,
  user_id,
  name,
  location_id,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'YOUR_USER_ID',  -- Replace with actual user_id
  'Home',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  NOW(),
  NOW()
);

-- Step 4: Create entity_location for the user's entity
INSERT INTO entity_location (entity_id, location_id, created_at)
VALUES (
  'YOUR_ENTITY_ID',  -- Replace with actual entity_id from Step 1
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  NOW()
) ON CONFLICT DO NOTHING;

-- Step 5: Force recalculate model
SELECT * FROM public.f_create_current_model('YOUR_USER_ID', 7, TRUE);
```

### Important: Location Constraint for Tasks

**⚠️ Until locations are fully implemented in the engine, ALL tasks must use "Home" as the location.**

When creating tasks via chat, the LLM should automatically use "Home" as the default location. If you encounter issues:

1. Make sure the task is linked to a `user_place_location` with a valid `location_id`
2. Don't create tasks with different locations (e.g., "Gym", "Office") unless those locations have valid `location_id` values

### Debugging Commands

If tasks still don't appear, run these diagnostic queries:

```sql
-- Check what the solver sees
SELECT * FROM get_model_data(
  (SELECT model_id FROM current_model WHERE user_id = 'YOUR_USER_ID')
);

-- Verify user_place_location has location_id
SELECT user_location_id, name, location_id
FROM user_place_location
WHERE user_id = 'YOUR_USER_ID';

-- Check entity_location exists
SELECT el.entity_id, e.name, el.location_id
FROM entity_location el
JOIN entity e ON el.entity_id = e.entity_id
WHERE e.user_id = 'YOUR_USER_ID';

-- Check task_solution was created
SELECT ts.task_id, t.name, ts.solution_json
FROM task_solution ts
JOIN task t ON ts.task_id = t.task_id
WHERE t.user_id = 'YOUR_USER_ID';
```

### Clearing Bad Tasks

If old/invalid tasks are blocking the solver (e.g., tasks with past dates), clear them:

```sql
-- Delete all task-related data for user
DELETE FROM task_location WHERE task_id IN (SELECT task_id FROM task WHERE user_id = 'YOUR_USER_ID');
DELETE FROM task_entity WHERE task_id IN (SELECT task_id FROM task WHERE user_id = 'YOUR_USER_ID');
DELETE FROM scheduled_task WHERE user_id = 'YOUR_USER_ID';
DELETE FROM task WHERE user_id = 'YOUR_USER_ID';

-- Recreate model
SELECT * FROM public.f_create_current_model('YOUR_USER_ID', 7, TRUE);
```

### Long-term Fix (Pending)

The proper fix is to update the `create_schedule_from_llm` RPC function to:
1. Auto-create a default location record with coordinates
2. Auto-link `user_place_location` entries to valid `location_id`
3. Auto-create `entity_location` for new users

This is being worked on by the backend team.

---

*Last updated: December 24, 2025*


