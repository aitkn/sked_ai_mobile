# Notification Sounds

Add the following sound files to this directory for custom notification sounds:

## Required Sound Files

| Filename | Description | Format |
|----------|-------------|--------|
| `default.wav` | Standard notification sound | WAV or CAF |
| `gentle-chime.wav` | Soft sound for low-priority tasks | WAV or CAF |
| `priority-high.wav` | Attention-grabbing for urgent tasks | WAV or CAF |
| `urgent-alarm.wav` | Critical alerts | WAV or CAF |
| `health-reminder.wav` | Health/wellness reminders | WAV or CAF |
| `departure.wav` | Commute/travel alerts | WAV or CAF |

## iOS Requirements

For iOS, you can also use `.caf` (Core Audio Format) files.

Maximum duration: 30 seconds
Recommended: 2-5 seconds

## Android Requirements

Sounds should be placed in `android/app/src/main/res/raw/` for native Android builds.
Format: `.wav` or `.mp3`

## Usage

These sounds are referenced in:
- `app.json` expo-notifications plugin config
- `lib/notifications/notification-customization.ts`
- `lib/notifications/local-scheduler.ts`

## Generating Sounds

You can use free sound libraries like:
- https://freesound.org
- https://soundbible.com

Or generate tones using:
- Audacity
- GarageBand
- Online tone generators

