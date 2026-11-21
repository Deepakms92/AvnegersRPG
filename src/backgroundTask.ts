import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { handleNotificationResponse } from './moveService';

/**
 * Runs when a notification button ("I moved!" / "Snooze") is tapped while the
 * app is in the background or closed (Android). Must be defined at module
 * scope and imported from index.ts, before the app component loads.
 */
export const NOTIFICATION_TASK = 'move-reminder-notification-task';

TaskManager.defineTask<Notifications.NotificationTaskPayload>(NOTIFICATION_TASK, async ({ data, error }) => {
  if (error || !data || !('actionIdentifier' in data)) {
    return Notifications.BackgroundNotificationTaskResult.NoData;
  }
  try {
    await handleNotificationResponse(data);
    return Notifications.BackgroundNotificationTaskResult.NewData;
  } catch (e) {
    console.warn('[move-reminder] Background action failed.', e);
    return Notifications.BackgroundNotificationTaskResult.Failed;
  }
});

if (Platform.OS !== 'web') {
  Notifications.registerTaskAsync(NOTIFICATION_TASK).catch((e) =>
    console.warn('[move-reminder] Could not register the background task (expected in Expo Go).', e),
  );
}
