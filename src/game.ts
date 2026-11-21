import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'move-reminder-game-v1';

/** Moves needed in a day to count toward the streak. */
export const DAILY_GOAL = 5;
/** Moves closer together than this earn no XP (stops button-mashing). */
const XP_COOLDOWN_MS = 5 * 60_000;
/** Responding within this window after the alert earns the "on time" bonus. */
const QUICK_RESPONSE_MS = 5 * 60_000;

export type GameStats = {
  xp: number;
  totalMoves: number;
  dayKey: string;
  movesToday: number;
  streak: number;
  /** dayKey of the last day the daily goal was hit. */
  lastGoalDay: string | null;
  lastXpAt: number;
  badges: string[];
  walkMoves: number;
  quickMoves: number;
};

export const DEFAULT_STATS: GameStats = {
  xp: 0,
  totalMoves: 0,
  dayKey: dayKeyOf(Date.now()),
  movesToday: 0,
  streak: 0,
  lastGoalDay: null,
  lastXpAt: 0,
  badges: [],
  walkMoves: 0,
  quickMoves: 0,
};

export type Badge = {
  id: string;
  icon: string;
  name: string;
  hint: string;
  earned: (s: GameStats) => boolean;
};

export const BADGES: Badge[] = [
  { id: 'first', icon: '👟', name: 'First Step', hint: 'Make your first move', earned: (s) => s.totalMoves >= 1 },
  { id: 'quick', icon: '⚡', name: 'Lightning', hint: 'Move within 5 min of an alert', earned: (s) => s.quickMoves >= 1 },
  { id: 'walker', icon: '🚶', name: 'Wanderer', hint: 'Reset the timer by walking', earned: (s) => s.walkMoves >= 1 },
  { id: 'goal', icon: '🎯', name: 'Daily Goal', hint: `${DAILY_GOAL} moves in one day`, earned: (s) => s.movesToday >= DAILY_GOAL || s.lastGoalDay !== null },
  { id: 'streak3', icon: '🔥', name: 'On Fire', hint: '3-day streak', earned: (s) => s.streak >= 3 },
  { id: 'moves25', icon: '🏅', name: 'Mover', hint: '25 moves total', earned: (s) => s.totalMoves >= 25 },
  { id: 'level5', icon: '👑', name: 'Royalty', hint: 'Reach level 5', earned: (s) => levelInfo(s.xp).level >= 5 },
  { id: 'streak7', icon: '🌋', name: 'Unstoppable', hint: '7-day streak', earned: (s) => s.streak >= 7 },
];

const TITLES = [
  'Couch Potato',
  'Desk Dweller',
  'Chair Escapee',
  'Hallway Ranger',
  'Stretch Ninja',
  'Move Master',
  'Legend of Motion',
];

/** XP needed to go from level n to n+1 grows by 50 each level: 100, 150, 200… */
export function levelInfo(xp: number) {
  let level = 1;
  let floor = 0;
  let need = 100;
  while (xp >= floor + need) {
    floor += need;
    level += 1;
    need += 50;
  }
  return {
    level,
    title: TITLES[Math.min(level - 1, TITLES.length - 1)],
    intoLevel: xp - floor,
    levelSize: need,
    progress: (xp - floor) / need,
  };
}

export function dayKeyOf(t: number) {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function yesterdayKey(t: number) {
  return dayKeyOf(t - 24 * 60 * 60_000);
}

/** Roll the day over and expire a broken streak. */
export function normalize(s: GameStats, now = Date.now()): GameStats {
  const today = dayKeyOf(now);
  let next = s;
  if (s.dayKey !== today) next = { ...next, dayKey: today, movesToday: 0 };
  if (next.lastGoalDay && next.lastGoalDay !== today && next.lastGoalDay !== yesterdayKey(now)) {
    next = { ...next, streak: 0 };
  }
  return next;
}

export type MoveResult = {
  stats: GameStats;
  xpGained: number;
  reasons: string[];
  leveledUp: boolean;
  newBadges: Badge[];
};

/**
 * Applies a "move" to the stats.
 * @param overdueByMs how long past the due time the move happened (negative = early)
 */
export function recordMove(
  prev: GameStats,
  opts: { now: number; overdueByMs: number; viaSteps: boolean },
): MoveResult {
  const s = normalize(prev, opts.now);
  const reasons: string[] = [];
  let xp = 0;

  const onCooldown = opts.now - s.lastXpAt < XP_COOLDOWN_MS;
  const quick = opts.overdueByMs >= 0 && opts.overdueByMs <= QUICK_RESPONSE_MS;

  if (!onCooldown) {
    xp += 10;
    reasons.push('Move +10');
    if (quick) {
      xp += 15;
      reasons.push('Quick response +15');
    } else if (opts.overdueByMs < 0) {
      xp += 5;
      reasons.push('Proactive +5');
    }
    if (opts.viaSteps) {
      xp += 5;
      reasons.push('Walking +5');
    }
  }

  const movesToday = s.movesToday + 1;
  let { streak, lastGoalDay } = s;
  if (movesToday === DAILY_GOAL && lastGoalDay !== s.dayKey) {
    streak = lastGoalDay === yesterdayKey(opts.now) ? streak + 1 : 1;
    lastGoalDay = s.dayKey;
    xp += 50;
    reasons.push('Daily goal +50');
  }

  const next: GameStats = {
    ...s,
    xp: s.xp + xp,
    totalMoves: s.totalMoves + 1,
    movesToday,
    streak,
    lastGoalDay,
    lastXpAt: onCooldown ? s.lastXpAt : opts.now,
    walkMoves: s.walkMoves + (opts.viaSteps ? 1 : 0),
    quickMoves: s.quickMoves + (quick ? 1 : 0),
  };

  const newBadges = BADGES.filter((b) => !next.badges.includes(b.id) && b.earned(next));
  next.badges = [...next.badges, ...newBadges.map((b) => b.id)];

  return {
    stats: next,
    xpGained: xp,
    reasons,
    leveledUp: levelInfo(next.xp).level > levelInfo(s.xp).level,
    newBadges,
  };
}

export async function loadStats(): Promise<GameStats> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? { ...DEFAULT_STATS, ...JSON.parse(raw) } : DEFAULT_STATS;
    return normalize(parsed);
  } catch {
    return DEFAULT_STATS;
  }
}

export async function saveStats(s: GameStats) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Non-fatal for a POC.
  }
}
