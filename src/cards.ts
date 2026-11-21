/** Challenge cards: every alert deals one. Rarer cards are worth more XP. */

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export const RARITY: Record<Rarity, { label: string; icon: string; color: string; weight: number; xp: number }> = {
  common: { label: 'Common', icon: '🟢', color: '#9BFF3B', weight: 60, xp: 0 },
  rare: { label: 'Rare', icon: '🔵', color: '#3BE8FF', weight: 25, xp: 10 },
  epic: { label: 'Epic', icon: '🟣', color: '#B57BFF', weight: 12, xp: 20 },
  legendary: { label: 'Legendary', icon: '🟡', color: '#FFD23B', weight: 3, xp: 40 },
};

export type ChallengeCard = { id: string; rarity: Rarity; emoji: string; title: string; text: string };

export const CARDS: ChallengeCard[] = [
  { id: 'window', rarity: 'common', emoji: '🪟', title: 'Window Walk', text: 'Walk to a window and look outside for 20 seconds.' },
  { id: 'water', rarity: 'common', emoji: '💧', title: 'Hydrate', text: 'Get up and refill your water glass.' },
  { id: 'shoulders', rarity: 'common', emoji: '🔄', title: 'Shoulder Rolls', text: 'Stand up and do 10 slow shoulder rolls, both ways.' },
  { id: 'neck', rarity: 'common', emoji: '🦒', title: 'Neck Stretch', text: 'Tilt your head side to side, 5 times each way.' },
  { id: 'reach', rarity: 'common', emoji: '🙆', title: 'Sky Reach', text: 'Stand up and stretch your arms to the ceiling.' },
  { id: 'wrists', rarity: 'common', emoji: '✋', title: 'Wrist Saver', text: 'Shake out and circle your wrists for 20 seconds.' },
  { id: 'calves', rarity: 'common', emoji: '🦶', title: 'Calf Raises', text: 'Do 15 calf raises.' },
  { id: 'lap', rarity: 'common', emoji: '🚶', title: 'Office Lap', text: 'Take one lap around the room.' },
  { id: 'eyes', rarity: 'common', emoji: '👀', title: 'Far Focus', text: 'Stand and look at something far away for 20 seconds.' },
  { id: 'breaths', rarity: 'common', emoji: '🌬️', title: 'Big Breaths', text: 'Stand up and take 5 slow, deep breaths.' },
  { id: 'squats', rarity: 'rare', emoji: '🏋️', title: 'Squat Squad', text: 'Do 10 squats.' },
  { id: 'deskpush', rarity: 'rare', emoji: '💪', title: 'Desk Push-ups', text: 'Do 10 push-ups against your desk.' },
  { id: 'march', rarity: 'rare', emoji: '🥁', title: 'March On', text: 'March in place for 1 minute.' },
  { id: 'sidebend', rarity: 'rare', emoji: '🌊', title: 'Side Bends', text: 'Do 10 side bends each way.' },
  { id: 'toes', rarity: 'rare', emoji: '🦵', title: 'Toe Touch', text: 'Reach for your toes and hold for 15 seconds.' },
  { id: 'dance', rarity: 'rare', emoji: '🕺', title: 'Dance Break', text: 'Dance through one chorus of any song.' },
  { id: 'flamingo', rarity: 'rare', emoji: '🦩', title: 'Flamingo', text: 'Stand on one leg for 30 seconds, then switch.' },
  { id: 'fullstretch', rarity: 'epic', emoji: '🧘', title: 'Full Stretch', text: 'Do a 2-minute full-body stretch.' },
  { id: 'lunges', rarity: 'epic', emoji: '⚔️', title: 'Lunge Warrior', text: 'Do 10 lunges on each leg.' },
  { id: 'walktalk', rarity: 'epic', emoji: '📞', title: 'Walk & Talk', text: 'Take your next call or voice message walking around.' },
  { id: 'plank', rarity: 'epic', emoji: '🪵', title: 'Plank', text: 'Hold a plank for 30 seconds.' },
  { id: 'jacks', rarity: 'epic', emoji: '⭐', title: 'Star Jumps', text: 'Do 20 jumping jacks.' },
  { id: 'stairs', rarity: 'legendary', emoji: '🪜', title: 'Stairway Hero', text: 'Take the stairs up and down one floor.' },
  { id: 'outside', rarity: 'legendary', emoji: '🌳', title: 'Touch Grass', text: 'Step outside for 2 minutes of fresh air.' },
  { id: 'walk5', rarity: 'legendary', emoji: '🏆', title: 'Five-Minute Walk', text: 'Walk for 5 minutes straight.' },
];

const BY_ID = new Map(CARDS.map((c) => [c.id, c]));

export function cardById(id: string | null | undefined): ChallengeCard | null {
  return id ? BY_ID.get(id) ?? null : null;
}

/** Draws a random card, weighted by rarity. */
export function drawCard(rand = Math.random): ChallengeCard {
  const rarities = Object.keys(RARITY) as Rarity[];
  const total = rarities.reduce((sum, r) => sum + RARITY[r].weight, 0);
  let roll = rand() * total;
  let rarity: Rarity = 'common';
  for (const r of rarities) {
    roll -= RARITY[r].weight;
    if (roll < 0) {
      rarity = r;
      break;
    }
  }
  const pool = CARDS.filter((c) => c.rarity === rarity);
  return pool[Math.floor(rand() * pool.length)];
}
