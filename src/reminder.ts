import * as Notifications from 'expo-notifications';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import { Platform, Vibration } from 'react-native';

export const CHANNEL_ID = 'move-reminder-loud';
const CHANNEL_ID_FALLBACK = 'move-reminder';
const INFO_CHANNEL_ID = 'move-reminder-info';

export const CATEGORY_ID = 'move-reminder';
export const ACTION_MOVED = 'moved';
export const ACTION_SNOOZE = 'snooze';
export const SNOOZE_MIN = 5;

/**
 * Follow-up nags (minutes after the first alert) if you ignore the reminder:
 * quickly at first, then every 10 minutes for 3 hours, until you move.
 */
const NAG_OFFSETS_MIN = [2, 5, 10, 15, 20, ...Array.from({ length: 16 }, (_, i) => 30 + i * 10)];

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
  await setupActions();
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(INFO_CHANNEL_ID, {
      name: 'Rewards and confirmations',
      description: 'Quiet messages like "+25 XP, energy restored"',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: null,
      enableVibrate: false,
    });
  } catch (e) {
    console.warn('[move-reminder] Could not create the info channel.', e);
  }
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

/** "I moved!" and "Snooze" buttons on every reminder notification. */
async function setupActions() {
  try {
    await Notifications.setNotificationCategoryAsync(CATEGORY_ID, [
      { identifier: ACTION_MOVED, buttonTitle: '✅ I moved!', options: { opensAppToForeground: false } },
      {
        identifier: ACTION_SNOOZE,
        buttonTitle: `⏰ Snooze ${SNOOZE_MIN} min`,
        options: { opensAppToForeground: false },
      },
    ]);
  } catch (e) {
    console.warn('[move-reminder] Could not register notification buttons.', e);
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const req = await Notifications.requestPermissionsAsync();
  return req.granted;
}

/**
 * Schedules the main reminder plus follow-up nags. These fire even if the app
 * is in the background or killed, and keep coming until you move or snooze.
 */
export async function scheduleReminders(dueAt: number, lastMovedAt: number) {
  await Notifications.cancelAllScheduledNotificationsAsync();
  const times = [0, ...NAG_OFFSETS_MIN].map((offset) => dueAt + offset * 60_000);
  for (const [i, when] of times.entries()) {
    if (when <= Date.now()) continue;
    const sittingMin = Math.max(1, Math.round((when - lastMovedAt) / 60_000));
    await Notifications.scheduleNotificationAsync({
      content: {
        title: i === 0 ? '🧟 Energy at 0%, time to move!' : `⚠️ Still sitting: ${sittingMin} min`,
        body: pickPhrase(sittingMin),
        sound: 'default',
        vibrate: [0, 800, 400, 800],
        priority: Notifications.AndroidNotificationPriority.MAX,
        categoryIdentifier: CATEGORY_ID,
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

/** A quiet, immediate notification (e.g. "+25 XP, energy restored"). */
export async function showInfo(title: string, body: string) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: false, data: { kind: 'move-info' } },
      trigger: Platform.OS === 'android' ? { channelId: INFO_CHANNEL_ID } : null,
    });
  } catch (e) {
    console.warn('[move-reminder] Could not show info notification.', e);
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

/** Speak a short message (praise, level up…) at full volume. */
export function say(text: string) {
  Speech.stop();
  Speech.speak(text, { volume: 1.0 });
}

export function stopAlert() {
  Speech.stop();
  Vibration.cancel();
}
