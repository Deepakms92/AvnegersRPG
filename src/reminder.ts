import * as Notifications from 'expo-notifications';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import { Platform, Vibration } from 'react-native';

export const CHANNEL_ID = 'move-reminder-loud';
const CHANNEL_ID_FALLBACK = 'move-reminder';

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

/** Channel used when scheduling; falls back if the loud one can't be created. */
let activeChannelId: string | undefined = CHANNEL_ID;

const BASE_CHANNEL = {
  name: 'Move reminders (loud)',
  description: 'Loud alerts telling you to get up and move',
  importance: Notifications.AndroidImportance.MAX,
  vibrationPattern: [0, 800, 400, 800, 400, 800],
  enableVibrate: true,
  lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
};

/**
 * Tries, in order:
 *  1. A max-importance channel that plays its sound on the ALARM audio stream
 *     (loud even when media volume is low). Works in development builds.
 *  2. A plain max-importance channel (Expo Go rejects some options from step 1).
 *  3. Expo's default channel.
 * Android locks channel settings once created; uninstall the app to change them.
 */
export async function setupAndroidChannel() {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      ...BASE_CHANNEL,
      sound: 'default',
      bypassDnd: true,
      audioAttributes: {
        usage: Notifications.AndroidAudioUsage.ALARM,
        contentType: Notifications.AndroidAudioContentType.SONIFICATION,
        flags: { enforceAudibility: true, requestHardwareAudioVideoSynchronization: false },
      },
    });
    activeChannelId = CHANNEL_ID;
    return;
  } catch (e) {
    console.warn('[move-reminder] Loud channel unavailable, using a simpler one.', e);
  }
  try {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID_FALLBACK, BASE_CHANNEL);
    activeChannelId = CHANNEL_ID_FALLBACK;
  } catch (e) {
    console.warn('[move-reminder] Could not create a channel, using the default one.', e);
    activeChannelId = undefined;
  }
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
        channelId: activeChannelId,
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
