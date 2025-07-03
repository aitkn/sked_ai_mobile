# SkedAI Task Processor

A Node.js service that monitors the task database, generates AI solutions, creates user timelines, and sends intelligent notifications.

## Features

- **Real-time Task Monitoring**: Watches for new tasks via PostgreSQL triggers and polling
- **Mock AI Solution Generation**: Creates optimal scheduling solutions based on task analysis
- **Smart Timeline Creation**: Generates comprehensive timelines with context tasks
- **Intelligent Notifications**: 
  - Push notifications only during critical windows (30s before intervals)
  - Realtime updates for active app users
  - Respects 5-minute scheduling granularity
- **Comprehensive Logging**: Detailed processing logs and status reporting

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Task Monitor  │───▶│ Solution Generator│───▶│Timeline Generator│
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                         │
┌─────────────────┐    ┌──────────────────┐             │
│ Notification    │◀───│ Realtime Service │◀────────────┘
│ Service         │    │                  │
└─────────────────┘    └──────────────────┘
```

## Global Configuration

### Timing Constants (config/globals.js)

- **INTERVAL_GRANULARITY**: `5` minutes (tasks scheduled at 8:00, 8:05, 8:10...)
- **NOTIFICATION_LEAD_TIME**: `30` seconds (push notifications sent 30s before intervals)

### Critical Notification Windows

- Task at 8:00 → Push notification at 7:59:30
- Task at 8:05 → Push notification at 8:04:30
- Task at 8:10 → Push notification at 8:09:30

## Smart Notification Logic

```javascript
// Push notifications are sent ONLY if:
// 1. User is NOT active in the app AND
// 2. Current time is within 30s of next interval AND  
// 3. New timeline contains tasks starting in next interval

// Otherwise, only realtime updates are sent (instant for active users)
```

## Installation

```bash
cd task-processor
npm install
```

## Configuration

1. Copy environment file:
```bash
cp .env.example .env
```

2. Update `.env` with your Supabase credentials:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
```

## Usage

### Start the processor:
```bash
npm start
```

### Development mode (with auto-restart):
```bash
npm run dev
```

### Test notifications:
```bash
# Send test notification to default user
node index.js --test-notification

# Send test notification to specific user
node index.js --test-notification user-id-here
```

## How It Works

### 1. Task Detection
- **Realtime**: PostgreSQL triggers notify of new task insertions
- **Polling**: Backup polling every 30 seconds for reliability
- **Deduplication**: Tracks processed tasks to avoid duplicates

### 2. Solution Generation
- Analyzes task name/definition for duration and preferences
- Generates optimal start times based on task type:
  - **Fitness tasks**: Morning preference
  - **Work tasks**: Business hours
  - **Meetings**: Business hours only
  - **Meals**: Evening preference
- Respects 5-minute interval granularity
- Creates mock confidence scores and reasoning

### 3. Timeline Creation
- Integrates new task with existing user timeline
- Resolves scheduling conflicts automatically
- Adds context tasks (preparation, breaks)
- Filters out past/completed tasks
- Saves both 'calendar' and 'notification' timeline types

### 4. Smart Notifications
- **Active Users**: Instant realtime updates only
- **Background Users**: Push notifications during critical windows
- **Timing**: Only 30 seconds before 5-minute intervals
- **Content**: Upcoming task details with start time

## Database Integration

### Tables Used:
- `skedai.task` - Source tasks (monitored)
- `skedai.solution` - Generated solutions
- `skedai.user_timeline` - User timelines
- `skedai.model` - Solution metadata

### Timeline JSON Format:
```json
{
  "tasks": [
    {
      "name": "Study machine learning",
      "start_time": "2025-06-19T08:00:00.000Z",
      "end_time": "2025-06-19T09:00:00.000Z", 
      "duration": 3600,
      "task_type": "education",
      "priority": "medium",
      "auto_generated": true
    }
  ],
  "created_at": "2025-06-19T07:30:00.000Z",
  "description": "Updated timeline with new task"
}
```

## React Native App Integration

### Realtime Subscriptions (for active users):
```javascript
// In your React Native app
const channel = supabase
  .channel('timeline-updates')
  .on('broadcast', { event: 'timeline_update' }, (payload) => {
    // Instantly update schedule screen
    refreshTimeline(payload.timeline)
  })
  .subscribe()
```

### Push Notifications (for background users):
- Works in Expo Go during development
- Automatic delivery during critical timing windows
- Contains task details and start time

## Monitoring & Status

The processor provides detailed status information:

```javascript
// Status includes:
- isRunning: boolean
- processedTasks: number  
- errorCount: number
- uptimeMinutes: number
- realtimeService: connection status
- notificationService: active users count
```

Status reports are logged every 5 minutes automatically.

## Error Handling

- Graceful error handling for each processing stage
- Failed tasks don't block subsequent processing
- Error status broadcast via realtime
- Recent errors tracked and reported in status

## Testing

### Manual Testing:
1. Insert a task into `skedai.task` table
2. Watch processor logs for processing stages  
3. Check `skedai.solution` and `skedai.user_timeline` tables
4. Verify notifications sent (if in critical window)

### Integration Testing:
Use the React Native app's task creation modal to test the full pipeline:
1. Voice/text input → prompt table
2. Edge function → task table  
3. Task processor → solution + timeline
4. Notifications → app updates

## Development Notes

- Built with ES modules (Node.js 16+)
- Uses Supabase realtime for instant updates
- Expo Server SDK for push notifications
- PostgreSQL for reliable task monitoring
- Configurable timing constants for easy adjustment