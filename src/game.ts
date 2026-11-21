import AsyncStorage from '@react-native-async-storage/async-storage';

import { CARDS, ChallengeCard, RARITY } from './cards';
import { DEFAULT_SCHEDULE, isWorkday, WorkSchedule } from './schedule';

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
  /** Challenge cards completed: card id → times completed. */
  cards: Record<string, number>;
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
  cards: {},
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
  { id: 'collector', icon: '📚', name: 'Collector', hint: 'Collect 10 different cards', earned: (s) => Object.keys(s.cards).length >= 10 },
  {
    id: 'legend',
    icon: '🌟',
    name: 'Legendary',
    hint: 'Complete a Legendary card',
    earned: (s) => CARDS.some((c) => c.rarity === 'legendary' && (s.cards[c.id] ?? 0) > 0),
  },
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

/**
 * Whether a scheduled work day was missed between the last day the goal was hit
 * and today. Days off (outside work hours) don't count, so weekends don't break
 * your streak.
 */
function missedWorkday(lastGoalDay: string, now: number, schedule: WorkSchedule) {
  const [y, m, d] = lastGoalDay.split('-').map(Number);
  const today = dayKeyOf(now);
  const day = new Date(y, m - 1, d + 1, 12);
  for (let i = 0; i < 400; i++) {
    if (dayKeyOf(day.getTime()) === today) return false;
    if (isWorkday(day.getTime(), schedule)) return true;
    day.setDate(day.getDate() + 1);
  }
  return true;
}

/** Roll the day over and expire a broken streak. */
export function normalize(s: GameStats, now = Date.now(), schedule = DEFAULT_SCHEDULE): GameStats {
  const today = dayKeyOf(now);
  let next = s;
  if (s.dayKey !== today) next = { ...next, dayKey: today, movesToday: 0 };
  if (next.lastGoalDay && next.lastGoalDay !== today && missedWorkday(next.lastGoalDay, now, schedule)) {
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
  /** The challenge card completed by this move, if any. */
  card: ChallengeCard | null;
  /** True the first time this card is completed. */
  newCard: boolean;
};

/**
 * Applies a "move" to the stats.
 * @param overdueByMs how long past the due time the move happened (negative = early)
 */
export function recordMove(
  prev: GameStats,
  opts: {
    now: number;
    overdueByMs: number;
    viaSteps: boolean;
    /** The card dealt for this session; completed if you move after the alert. */
    card?: ChallengeCard | null;
    schedule?: WorkSchedule;
  },
): MoveResult {
  const schedule = opts.schedule ?? DEFAULT_SCHEDULE;
  const s = normalize(prev, opts.now, schedule);
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

  // The challenge card counts once the alert has gone off (honour system).
  const card = opts.card && opts.overdueByMs >= 0 ? opts.card : null;
  const newCard = !!card && !(s.cards[card.id] > 0);
  if (card && RARITY[card.rarity].xp > 0) {
    xp += RARITY[card.rarity].xp;
    reasons.push(`${RARITY[card.rarity].label} card +${RARITY[card.rarity].xp}`);
  }

  const movesToday = s.movesToday + 1;
  let { streak, lastGoalDay } = s;
  if (movesToday === DAILY_GOAL && lastGoalDay !== s.dayKey) {
    streak = lastGoalDay && !missedWorkday(lastGoalDay, opts.now, schedule) ? streak + 1 : 1;
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
    cards: card ? { ...s.cards, [card.id]: (s.cards[card.id] ?? 0) + 1 } : s.cards,
  };

  const newBadges = BADGES.filter((b) => !next.badges.includes(b.id) && b.earned(next));
  next.badges = [...next.badges, ...newBadges.map((b) => b.id)];

  return {
    stats: next,
    xpGained: xp,
    reasons,
    leveledUp: levelInfo(next.xp).level > levelInfo(s.xp).level,
    newBadges,
    card,
    newCard,
  };
}

export async function loadStats(schedule = DEFAULT_SCHEDULE): Promise<GameStats> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? { ...DEFAULT_STATS, ...JSON.parse(raw) } : DEFAULT_STATS;
    return normalize(parsed, Date.now(), schedule);
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
