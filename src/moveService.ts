import * as Notifications from 'expo-notifications';

import { HATS, stageFor } from './buddyData';
import { cardById, drawCard, RARITY } from './cards';
import { levelInfo, loadStats, MoveResult, recordMove, recordSnooze, saveStats } from './game';
import {
  ACTION_MOVED,
  ACTION_SNOOZE,
  cancelReminders,
  scheduleForState,
  showInfo,
  SNOOZE_MIN,
} from './reminder';
import { timerView } from './schedule';
import { loadState, PersistedState, saveState } from './storage';
import { pickLine, Voice, voiceById, VOICES } from './voices';

/** Replace pending reminders. A failure here must never lose the recorded move. */
export async function reschedule(state: PersistedState) {
  try {
    await cancelReminders();
    if (state.enabled) await scheduleForState(state);
  } catch (e) {
    console.warn('[wellping] Could not reschedule reminders.', e);
  }
}

/**
 * Records a move: awards XP (and the dealt challenge card, if the alert already
 * went off), deals a new card, resets the timer and reschedules reminders.
 * Works from the app UI, the step counter or a notification button (even when
 * the app is closed), because it reads and writes saved state directly.
 */
export async function applyMove(opts: { viaSteps: boolean; now?: number }): Promise<{
  state: PersistedState;
  result: MoveResult | null;
}> {
  const t = opts.now ?? Date.now();
  const state = await loadState();
  const stats = await loadStats(state.schedule);
  const tv = timerView(state, t);

  let result: MoveResult | null = null;
  if (state.enabled) {
    result = recordMove(stats, {
      now: t,
      overdueByMs: tv.offDuty ? -1 : t - tv.dueAt,
      viaSteps: opts.viaSteps,
      card: tv.offDuty ? null : cardById(state.cardId),
      schedule: state.schedule,
      sittingMin: (t - tv.base) / 60_000,
    });
    await saveStats(result.stats);
  }

  const next: PersistedState = { ...state, lastMovedAt: t, snoozeUntil: 0, cardId: drawCard().id };
  await saveState(next);

  if (next.enabled) await reschedule(next);
  return { state: next, result };
}

/** Silences alerts for a few minutes without resetting the sitting timer or awarding XP. */
export async function applySnooze(now = Date.now()) {
  const state = await loadState();
  const next: PersistedState = { ...state, snoozeUntil: now + SNOOZE_MIN * 60_000 };
  await saveState(next);
  await saveStats(recordSnooze(await loadStats(state.schedule), now));
  await reschedule(next);
  return next;
}

export type MoveSummary = {
  title: string;
  lines: string[];
  speech: string;
  kind: 'level' | 'badge' | 'card' | 'xp' | 'plain';
};

/** What a move unlocked: voices and hats from a level-up or new badge, and evolution. */
function unlocksFor(result: MoveResult) {
  const newLevel = levelInfo(result.stats.xp).level;
  const oldLevel = levelInfo(result.stats.xp - result.xpGained).level;
  const badgeIds = result.newBadges.map((b) => b.id);
  const voices = VOICES.filter((v) => v.unlockLevel > oldLevel && v.unlockLevel <= newLevel);
  const hats = HATS.filter(
    (h) => (h.level && h.level > oldLevel && h.level <= newLevel) || (h.badge && badgeIds.includes(h.badge)),
  );
  const evolved = stageFor(newLevel).index > stageFor(oldLevel).index ? stageFor(newLevel).name : null;
  const lines = [
    ...(evolved ? [`✨ Pip evolved into ${evolved}!`] : []),
    ...voices.map((v) => `🔓 New voice: ${v.emoji} ${v.name}`),
    ...hats.map((h) => `🔓 New hat: ${h.emoji} ${h.name}`),
  ];
  const speech = [
    evolved ? `Whoa! Pip evolved into ${evolved}!` : '',
    voices.length ? `New voice unlocked: ${voices.map((v) => v.name).join(' and ')}!` : '',
  ]
    .filter(Boolean)
    .join(' ');
  return { lines, speech };
}

/** Short text describing a move result, for pop-ups, notifications and speech. */
export function describeMove(result: MoveResult | null, viaSteps: boolean, voice: Voice): MoveSummary {
  if (!result) return { title: 'Energy restored', lines: [], speech: pickLine(voice.praise), kind: 'plain' };
  const unlocks = unlocksFor(result);
  if (result.leveledUp) {
    const li = levelInfo(result.stats.xp);
    return {
      title: `LEVEL ${li.level}!`,
      lines: [li.title, ...unlocks.lines, ...result.reasons],
      speech: `${voice.levelUp(li.title)} ${unlocks.speech}`.trim(),
      kind: 'level',
    };
  }
  if (result.newBadges.length) {
    const b = result.newBadges[0];
    return {
      title: `${b.icon} ${b.name}`,
      lines: ['Badge unlocked!', ...unlocks.lines, ...result.reasons],
      speech: voice.badge(b.name),
      kind: 'badge',
    };
  }
  if (result.card) {
    const r = RARITY[result.card.rarity];
    return {
      title: `${result.card.emoji} ${result.card.title}`,
      lines: [
        `${r.icon} ${r.label} card complete!${result.newCard ? ' New for your collection.' : ''}`,
        ...result.reasons,
      ],
      speech: voice.card(result.card.title),
      kind: 'card',
    };
  }
  if (result.xpGained > 0) {
    return {
      title: `+${result.xpGained} XP`,
      lines: result.reasons,
      speech: viaSteps ? `Nice walk! ${pickLine(voice.praise)}` : pickLine(voice.praise),
      kind: 'xp',
    };
  }
  return {
    title: 'Energy restored',
    lines: ['XP cooldown: move again later'],
    speech: pickLine(voice.praise),
    kind: 'plain',
  };
}

function responseKey(r: Notifications.NotificationResponse) {
  return `${r.notification.request.identifier}|${r.actionIdentifier}|${r.notification.date}`;
}

/**
 * Handles the "I moved!" / "Snooze" buttons on a reminder notification.
 * Returns what happened, or null if the response wasn't ours or was already handled.
 */
export async function handleNotificationResponse(r: Notifications.NotificationResponse) {
  if (r.notification.request.content.data?.kind !== 'move-reminder') return null;
  if (r.actionIdentifier !== ACTION_MOVED && r.actionIdentifier !== ACTION_SNOOZE) return null;

  // The background task and the in-app listener can both see the same tap: handle it once.
  const key = responseKey(r);
  const state = await loadState();
  if (state.lastHandledResponse === key) return null;
  await saveState({ ...state, lastHandledResponse: key });

  if (r.actionIdentifier === ACTION_SNOOZE) {
    await applySnooze();
    await showInfo(`⏰ Snoozed for ${SNOOZE_MIN} min`, "I'll remind you again soon. No XP while snoozing!");
    return { kind: 'snooze' as const };
  }

  const { result } = await applyMove({ viaSteps: false });
  const d = describeMove(result, false, voiceById(state.voiceId));
  await showInfo(`✅ ${d.title}`, d.lines.length ? d.lines.join(' · ') : 'Energy restored. Timer reset.');
  return { kind: 'moved' as const, result };
}
