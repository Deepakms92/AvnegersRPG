import * as Notifications from 'expo-notifications';

import { levelInfo, loadStats, MoveResult, recordMove, saveStats } from './game';
import {
  ACTION_MOVED,
  ACTION_SNOOZE,
  cancelReminders,
  scheduleReminders,
  showInfo,
  SNOOZE_MIN,
} from './reminder';
import { loadState, nextDueAt, PersistedState, saveState } from './storage';

/** Replace pending reminders. A failure here must never lose the recorded move. */
async function reschedule(state: PersistedState) {
  try {
    await cancelReminders();
    if (state.enabled) await scheduleReminders(nextDueAt(state), state.lastMovedAt);
  } catch (e) {
    console.warn('[move-reminder] Could not reschedule reminders.', e);
  }
}

/**
 * Records a move: awards XP, resets the timer and reschedules reminders.
 * Works from the app UI, the step counter or a notification button (even when
 * the app is closed), because it reads and writes saved state directly.
 */
export async function applyMove(opts: { viaSteps: boolean; now?: number }): Promise<{
  state: PersistedState;
  result: MoveResult | null;
}> {
  const t = opts.now ?? Date.now();
  const [state, stats] = await Promise.all([loadState(), loadStats()]);

  let result: MoveResult | null = null;
  if (state.enabled) {
    result = recordMove(stats, {
      now: t,
      overdueByMs: t - (state.lastMovedAt + state.intervalMin * 60_000),
      viaSteps: opts.viaSteps,
    });
    await saveStats(result.stats);
  }

  const next: PersistedState = { ...state, lastMovedAt: t, snoozeUntil: 0 };
  await saveState(next);

  if (next.enabled) await reschedule(next);
  return { state: next, result };
}

/** Silences alerts for a few minutes without resetting the sitting timer or awarding XP. */
export async function applySnooze(now = Date.now()) {
  const state = await loadState();
  const next: PersistedState = { ...state, snoozeUntil: now + SNOOZE_MIN * 60_000 };
  await saveState(next);
  await reschedule(next);
  return next;
}

/** Short text describing a move result, for pop-ups, notifications and speech. */
export function describeMove(result: MoveResult | null, viaSteps: boolean) {
  if (!result) return { title: 'Energy restored', lines: [] as string[], speech: 'Energy restored.', kind: 'plain' as const };
  if (result.leveledUp) {
    const li = levelInfo(result.stats.xp);
    return {
      title: `LEVEL ${li.level}!`,
      lines: [li.title, ...result.reasons],
      speech: `Level up! You are now a ${li.title}.`,
      kind: 'level' as const,
    };
  }
  if (result.newBadges.length) {
    const b = result.newBadges[0];
    return {
      title: `${b.icon} ${b.name}`,
      lines: ['Badge unlocked!', ...result.reasons],
      speech: `Badge unlocked: ${b.name}!`,
      kind: 'badge' as const,
    };
  }
  if (result.xpGained > 0) {
    return {
      title: `+${result.xpGained} XP`,
      lines: result.reasons,
      speech: viaSteps ? 'Nice walk! Energy restored.' : 'Nice! Energy restored.',
      kind: 'xp' as const,
    };
  }
  return {
    title: 'Energy restored',
    lines: ['XP cooldown: move again later'],
    speech: 'Energy restored.',
    kind: 'plain' as const,
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
  const d = describeMove(result, false);
  await showInfo(`✅ ${d.title}`, d.lines.length ? d.lines.join(' · ') : 'Energy restored. Timer reset.');
  return { kind: 'moved' as const, result };
}
