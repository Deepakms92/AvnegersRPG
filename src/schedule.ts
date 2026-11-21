/**
 * Work hours: reminders only run on chosen days between a start and end time.
 * Days outside the schedule don't break your streak.
 */

export type WorkSchedule = {
  enabled: boolean;
  /** Days of the week reminders run on: 0 = Sunday … 6 = Saturday. */
  days: number[];
  /** Minutes after midnight. */
  startMin: number;
  endMin: number;
};

export const DEFAULT_SCHEDULE: WorkSchedule = {
  enabled: false,
  days: [1, 2, 3, 4, 5],
  startMin: 9 * 60,
  endMin: 18 * 60,
};

export const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type Window = { start: number; end: number };
const ALWAYS: Window = { start: -Infinity, end: Infinity };

/** Local time `minutes` after midnight on the day containing `t` (DST-safe). */
function atMinutes(t: number, minutes: number) {
  const d = new Date(t);
  d.setHours(0, minutes, 0, 0);
  return d.getTime();
}

function addDays(t: number, n: number) {
  const d = new Date(t);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

/** Whether `t` falls on a scheduled day (every day counts when work hours are off). */
export function isWorkday(t: number, s: WorkSchedule) {
  return !s.enabled || s.days.includes(new Date(t).getDay());
}

/** The active window containing `t`, or null when outside work hours. */
export function windowAt(t: number, s: WorkSchedule): Window | null {
  if (!s.enabled) return ALWAYS;
  if (!s.days.includes(new Date(t).getDay())) return null;
  const start = atMinutes(t, s.startMin);
  const end = atMinutes(t, s.endMin);
  return t >= start && t < end ? { start, end } : null;
}

/** The next window that starts after `t` (looks up to a week ahead). */
export function nextWindow(t: number, s: WorkSchedule): Window | null {
  if (!s.enabled || s.days.length === 0) return null;
  for (let i = 0; i <= 7; i++) {
    const day = addDays(t, i);
    if (!s.days.includes(new Date(day).getDay())) continue;
    const start = atMinutes(day, s.startMin);
    if (start > t) return { start, end: atMinutes(day, s.endMin) };
  }
  return null;
}

export function formatClock(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/** e.g. "09:00" today, or "Mon 09:00" on another day. */
export function formatWhen(t: number, now: number) {
  const d = new Date(t);
  const clock = formatClock(d.getHours() * 60 + d.getMinutes());
  return new Date(now).toDateString() === d.toDateString() ? clock : `${DAY_NAMES[d.getDay()]} ${clock}`;
}

export type TimerInput = {
  enabled: boolean;
  lastMovedAt: number;
  intervalMin: number;
  snoozeUntil: number;
  schedule: WorkSchedule;
};

/** Everything the UI needs to know about the sitting timer right now. */
export function timerView(st: TimerInput, now: number) {
  const intervalMs = st.intervalMin * 60_000;
  const w = windowAt(now, st.schedule);
  const offDuty = st.enabled && !w;
  // The sitting clock starts at your last move, or at the start of today's work hours.
  const base = w ? Math.max(st.lastMovedAt, w.start) : now;
  const dueAt = base + intervalMs;
  const snoozed = st.enabled && !offDuty && now >= dueAt && now < st.snoozeUntil;
  const overdue = st.enabled && !offDuty && now >= dueAt && !snoozed;
  const energy = !st.enabled || offDuty ? 1 : Math.max(0, Math.min(1, (dueAt - now) / intervalMs));
  return {
    offDuty,
    base,
    dueAt,
    snoozed,
    overdue,
    energy,
    sittingMin: offDuty ? 0 : Math.floor((now - base) / 60_000),
    nextStart: offDuty ? nextWindow(now, st.schedule)?.start ?? null : null,
  };
}

/**
 * Follow-up nags (minutes after the first alert) if you ignore the reminder:
 * quickly at first, then every 10 minutes for 3 hours, until you move.
 */
const NAG_OFFSETS_MIN = [2, 5, 10, 15, 20, ...Array.from({ length: 16 }, (_, i) => 30 + i * 10)];
/** For upcoming work days only a short chain, to stay under iOS's 64-notification limit. */
const FUTURE_OFFSETS_MIN = [0, 5, 15];
const FUTURE_WINDOWS = 3;

export type PlannedReminder = { when: number; sittingMin: number; first: boolean };

/**
 * All reminders to schedule from now on: the current sitting session (with nags,
 * inside work hours), plus the first reminders of the next few work days so
 * WellPing keeps working even if you don't open the app.
 */
export function planReminders(st: TimerInput, now: number): PlannedReminder[] {
  if (!st.enabled) return [];
  const out: PlannedReminder[] = [];
  const intervalMs = st.intervalMin * 60_000;
  const chain = (base: number, end: number, offsets: number[], snoozeUntil: number) => {
    const due = Math.max(base + intervalMs, snoozeUntil);
    offsets.forEach((off, i) => {
      const when = due + off * 60_000;
      if (when > now && when < end) {
        out.push({ when, sittingMin: Math.max(1, Math.round((when - base) / 60_000)), first: i === 0 });
      }
    });
  };

  const w = windowAt(now, st.schedule);
  if (w) chain(Math.max(st.lastMovedAt, w.start), w.end, [0, ...NAG_OFFSETS_MIN], st.snoozeUntil);

  let t = w ? w.end : now;
  for (let i = 0; i < FUTURE_WINDOWS; i++) {
    const nw = nextWindow(t, st.schedule);
    if (!nw) break;
    chain(nw.start, nw.end, FUTURE_OFFSETS_MIN, 0);
    t = nw.end;
  }
  return out;
}
