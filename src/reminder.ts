import * as Notifications from 'expo-notifications';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import { Platform, Vibration } from 'react-native';

export const CHANNEL_ID = 'move-reminder-loud';

/** Follow-up nags (minutes after the first alert) if you ignore the reminder. */
const NAG_OFFSETS_MIN = [2, 5, 10, 20];

const PHRASES = [
  "Hey! You've been sitting for a long time. Time to stand up and move a bit!",
  'Up you get! Stretch your legs and walk around for a couple of minutes.',
  'Still sitting? Your body is asking for a break. Stand up and move!',
  'Movement break! Get up, roll your shoulders, and take a short walk.',
];

export function pickPhrase(minutes: number): string {
  const base = PHRASES[Math.floor(Math.random() * PHRASES.length)];
  return `You have been sitting for ${minutes} minute${minutes === 1 ? '' : 's'}. ${base}`;
}

/** Show alerts, play sound and vibrate even while the app is in the foreground. */
export function configureNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * A max-importance channel that routes its sound through the ALARM audio stream,
 * so it's loud and still plays when the media volume is low. Android channel
 * settings are fixed once created; to change them, uninstall the app or use a new channel id.
 */
export async function setupAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Move reminders (loud)',
    description: 'Loud alerts telling you to get up and move',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: [0, 800, 400, 800, 400, 800],
    enableVibrate: true,
    enableLights: true,
    lightColor: '#FF5722',
    bypassDnd: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    audioAttributes: {
      usage: Notifications.AndroidAudioUsage.ALARM,
      contentType: Notifications.AndroidAudioContentType.SONIFICATION,
      flags: { enforceAudibility: true, requestHardwareAudioVideoSynchronization: false },
    },
  });
}

export async function requestNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const req = await Notifications.requestPermissionsAsync();
  return req.granted;
}

/**
 * Schedules the main reminder plus a few follow-up nags. These fire even if the
 * app is in the background or killed, so you still get a loud alert.
 */
export async function scheduleReminders(dueAt: number, intervalMin: number) {
  await Notifications.cancelAllScheduledNotificationsAsync();
  const times = [0, ...NAG_OFFSETS_MIN].map((offset) => dueAt + offset * 60_000);
  for (const [i, when] of times.entries()) {
    if (when <= Date.now()) continue;
    const sittingMin = intervalMin + (i === 0 ? 0 : NAG_OFFSETS_MIN[i - 1]);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: i === 0 ? '🚶 Time to move!' : `⚠️ Still sitting — ${sittingMin} min`,
        body: pickPhrase(sittingMin),
        sound: 'default',
        vibrate: [0, 800, 400, 800],
        priority: Notifications.AndroidNotificationPriority.MAX,
        data: { kind: 'move-reminder', sittingMin },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: when,
        channelId: CHANNEL_ID,
      },
    });
  }
}

export async function cancelReminders() {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.dismissAllNotificationsAsync();
}

/** Speak the reminder out loud at full volume and buzz the phone. */
export function alertLoudly(text: string) {
  Speech.stop();
  Vibration.vibrate([0, 800, 400, 800, 400, 800]);
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  Speech.speak(text, { volume: 1.0, rate: 0.95, pitch: 1.05, language: 'en-US' });
}

export function praise() {
  Speech.stop();
  Speech.speak('Nice! You moved. Timer reset.', { volume: 1.0 });
}

export function stopAlert() {
  Speech.stop();
  Vibration.cancel();
}
