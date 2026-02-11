import './global';

// Register background notification handlers BEFORE the app loads
// This is required for Notifee to handle notifications when app is killed

// Try to register Notifee background handler
try {
  const notifee = require('@notifee/react-native').default;
  const { EventType } = require('@notifee/react-native');

  notifee.onBackgroundEvent(async ({ type, detail }) => {
    console.log('[Background] Notifee event:', type, detail);

    if (type === EventType.ACTION_PRESS || type === 1) {
      const actionId = detail.pressAction?.id || 'default';
      const taskId = detail.notification?.data?.task_id;

      if (taskId) {
        // Import action handler dynamically
        const { handleNotificationAction } = require('./lib/notifications/action-handler');
        await handleNotificationAction(actionId, taskId, detail.notification?.data?.previous_task_id);
      }
    }

    // Remove notification from tray after action
    if (type === EventType.DISMISSED || type === EventType.ACTION_PRESS) {
      if (detail.notification?.id) {
        await notifee.cancelNotification(detail.notification.id);
      }
    }
  });

  console.log('[Background] Notifee background handler registered');
} catch (error) {
  console.log('[Background] Notifee not available:', error.message);
}

// Try to register Firebase Messaging background handler
try {
  const messaging = require('@react-native-firebase/messaging').default;

  messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    console.log('[Background] Firebase message:', remoteMessage);

    const data = remoteMessage.data;
    if (data?.action === 'sync') {
      // Import sync service dynamically
      const { syncTasksFromSupabase } = require('./lib/sync/TaskSyncService');
      await syncTasksFromSupabase();
    }
  });

  console.log('[Background] Firebase Messaging background handler registered');
} catch (error) {
  console.log('[Background] Firebase Messaging not available:', error.message);
}

import 'expo-router/entry';