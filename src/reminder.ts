import * as Notifications from 'expo-notifications';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import { setAudioModeAsync } from 'expo-audio';
import { Platform, Vibration } from 'react-native';

import { cardById, RARITY } from './cards';
import { planReminders } from './schedule';
import type { PersistedState } from './storage';
import { Voice, voiceById } from './voices';

export const CHANNEL_ID = 'move-reminder-loud';
const CHANNEL_ID_FALLBACK = 'move-reminder';
const INFO_CHANNEL_ID = 'move-reminder-info';

export const CATEGORY_ID = 'move-reminder';
export const ACTION_MOVED = 'moved';
export const ACTION_SNOOZE = 'snooze';
export const SNOOZE_MIN = 5;

/** What the chosen voice says when it's time to move (with the dealt card, if any). */
export function reminderLine(state: PersistedState, minutes: number) {
  return voiceById(state.voiceId).remind(Math.max(1, minutes), cardById(state.cardId));
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
export async function setupNotifications() {
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

/**
 * "I moved!" and "Snooze" buttons on every reminder notification.
 * Android handles them in the background (see backgroundTask.ts); iOS can't run
 * that task, so there the buttons open the app, which then records the tap.
 */
async function setupActions() {
  const openApp = Platform.OS === 'ios';
  try {
    await Notifications.setNotificationCategoryAsync(CATEGORY_ID, [
      { identifier: ACTION_MOVED, buttonTitle: '✅ I moved!', options: { opensAppToForeground: openApp } },
      {
        identifier: ACTION_SNOOZE,
        buttonTitle: `⏰ Snooze ${SNOOZE_MIN} min`,
        options: { opensAppToForeground: openApp },
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
 * Schedules all upcoming reminders for this state: the current sitting session
 * with follow-up nags, plus the first reminders of the next work days. They fire
 * even if the app is in the background or killed, until you move or snooze.
 */
export async function scheduleForState(state: PersistedState) {
  await Notifications.cancelAllScheduledNotificationsAsync();
  const voice = voiceById(state.voiceId);
  const card = cardById(state.cardId);
  const cardTitle = card ? ` ${RARITY[card.rarity].icon} ${card.title}` : '';
  for (const r of planReminders(state, Date.now())) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: r.first ? `🧟 Energy at 0%!${cardTitle}` : `⚠️ Still sitting: ${r.sittingMin} min`,
        body: r.first ? voice.remind(r.sittingMin, card) : `${voice.nag(r.sittingMin)}${card ? ` ${card.text}` : ''}`,
        sound: 'default',
        vibrate: [0, 800, 400, 800],
        priority: Notifications.AndroidNotificationPriority.MAX,
        categoryIdentifier: CATEGORY_ID,
        data: { kind: 'move-reminder', sittingMin: r.sittingMin },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: r.when,
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

/**
 * Lets the spoken alert play even when the iPhone's silent switch is on, and
 * lowers (ducks) any music while it speaks. Safe to call on both platforms.
 */
export async function configureAudio() {
  try {
    await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers' });
  } catch (e) {
    console.warn('[move-reminder] Could not configure audio.', e);
  }
}

/** Speak the reminder out loud at full volume, in the chosen voice, and buzz the phone. */
export function alertLoudly(text: string, voice: Voice) {
  Speech.stop();
  Vibration.vibrate([0, 800, 400, 800, 400, 800]);
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  say(text, voice);
}

/** Speak a short message (praise, level up…) at full volume in the chosen voice. */
export function say(text: string, voice: Voice) {
  Speech.stop();
  Speech.speak(text, { volume: 1.0, rate: voice.rate, pitch: voice.pitch, language: 'en-US' });
}

export function stopAlert() {
  Speech.stop();
  Vibration.cancel();
}
