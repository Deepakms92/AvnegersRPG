import type { GameStats } from './game';

/**
 * Pip, your buddy: evolution stages and unlockable hats.
 * (Kept free of drawing code so the background task can use it.)
 */

export type BuddyMood = 'happy' | 'ok' | 'tired' | 'zombie' | 'sleep';

export const STAGES = [
  { minLevel: 1, name: 'Pip Sprout', body: '#9BFF3B', shade: '#5FC41A', rx: 52, ry: 48, cy: 130 },
  { minLevel: 3, name: 'Pip', body: '#3BE8FF', shade: '#1C9FBE', rx: 58, ry: 54, cy: 126 },
  { minLevel: 5, name: 'Pip Pro', body: '#B57BFF', shade: '#7B45D9', rx: 62, ry: 58, cy: 122 },
  { minLevel: 7, name: 'Pip Legend', body: '#FFD23B', shade: '#D4930B', rx: 64, ry: 60, cy: 120 },
];

export function stageFor(level: number) {
  let idx = 0;
  STAGES.forEach((s, i) => {
    if (level >= s.minLevel) idx = i;
  });
  return { ...STAGES[idx], index: idx, next: STAGES[idx + 1] ?? null };
}

export type Hat = { id: string; name: string; emoji: string; level?: number; badge?: string; hint: string };

export const HATS: Hat[] = [
  { id: 'none', name: 'No hat', emoji: '✖️', hint: '' },
  { id: 'cap', name: 'Cap', emoji: '🧢', level: 2, hint: 'Reach level 2' },
  { id: 'sweatband', name: 'Sweatband', emoji: '🎽', level: 3, hint: 'Reach level 3' },
  { id: 'party', name: 'Party Hat', emoji: '🥳', badge: 'goal', hint: 'Complete a daily quest' },
  { id: 'beanie', name: 'Beanie', emoji: '🧶', level: 4, hint: 'Reach level 4' },
  { id: 'crown', name: 'Crown', emoji: '👑', badge: 'level5', hint: 'Earn the Royalty badge' },
];

export function hatUnlocked(hat: Hat, level: number, stats: GameStats) {
  if (hat.level && level < hat.level) return false;
  if (hat.badge && !stats.badges.includes(hat.badge)) return false;
  return true;
}
