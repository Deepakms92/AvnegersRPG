import type { ChallengeCard } from './cards';

/**
 * Voice personalities. Each is the phone's text-to-speech voice with its own
 * pitch, speed and script. New ones unlock as you level up.
 */
export type Voice = {
  id: string;
  name: string;
  emoji: string;
  unlockLevel: number;
  pitch: number;
  rate: number;
  hello: string;
  remind: (minutes: number, card: ChallengeCard | null) => string;
  nag: (minutes: number) => string;
  praise: string[];
  levelUp: (title: string) => string;
  badge: (name: string) => string;
  card: (title: string) => string;
  /** Encouragement during a timed card: halfway, and the final seconds. */
  cheer: { half: string; end: string };
};

const task = (card: ChallengeCard | null, prefix: string) => (card ? ` ${prefix} ${card.text}` : '');

export const VOICES: Voice[] = [
  {
    id: 'coach',
    name: 'Coach Pip',
    emoji: '🏅',
    unlockLevel: 1,
    pitch: 1.05,
    rate: 0.95,
    hello: "Hi, I'm Coach Pip! I'll keep you moving.",
    remind: (m, c) => `Hey! You've been sitting for ${m} minutes. Time to move!${task(c, 'Your challenge:')}`,
    nag: (m) => `Still sitting? That's ${m} minutes. Up you get!`,
    praise: ['Nice! Energy restored.', 'Great move! Keep it up.', "That's the spirit!"],
    levelUp: (t) => `Level up! You are now a ${t}.`,
    badge: (n) => `Badge unlocked: ${n}!`,
    card: (t) => `Challenge complete: ${t}!`,
    cheer: { half: "Halfway there, you've got this!", end: 'Five more seconds!' },
  },
  {
    id: 'sergeant',
    name: 'Drill Sergeant',
    emoji: '🪖',
    unlockLevel: 2,
    pitch: 0.75,
    rate: 1.1,
    hello: 'Listen up, recruit! From now on, YOU MOVE WHEN I SAY MOVE!',
    remind: (m, c) => `ATTENTION! ${m} minutes in that chair, soldier? ON YOUR FEET!${task(c, 'Your orders:')}`,
    nag: (m) => `${m} MINUTES! Did I say you could sit? MOVE IT, MOVE IT!`,
    praise: ['Outstanding, soldier!', 'That is what I like to see! Dismissed!', 'Hoo-rah!'],
    levelUp: (t) => `Promotion! You are now a ${t}. Do not let it go to your head!`,
    badge: (n) => `You earned the ${n} medal. Wear it with pride!`,
    card: (t) => `Mission ${t}: complete!`,
    cheer: { half: 'Halfway, soldier! Do not quit on me!', end: 'Five seconds! PUSH!' },
  },
  {
    id: 'grandma',
    name: 'Grandma',
    emoji: '👵',
    unlockLevel: 3,
    pitch: 1.35,
    rate: 0.85,
    hello: "Hello sweetie, it's Grandma. Don't forget to get up and stretch, dear.",
    remind: (m, c) =>
      `Oh sweetie, you've been sitting for ${m} minutes. Your back will thank you.${task(c, 'Be a dear and do this for me:')}`,
    nag: (m) => `Dear, it's been ${m} minutes. Grandma is worried about you. Up you get!`,
    praise: ["That's my good little mover!", 'Oh, I am so proud of you!', 'Wonderful, sweetie!'],
    levelUp: (t) => `Look at you, a ${t} now! Grandma is so proud.`,
    badge: (n) => `A ${n} badge! I'll put it on the fridge.`,
    card: (t) => `You did the ${t}! What a treasure.`,
    cheer: { half: "You're halfway, sweetie!", end: 'Almost done, dear. Five more seconds.' },
  },
  {
    id: 'robot',
    name: 'Sarcastic Robot',
    emoji: '🤖',
    unlockLevel: 4,
    pitch: 0.6,
    rate: 0.92,
    hello: 'Greetings, human. I have been assigned to monitor your sitting. Thrilling.',
    remind: (m, c) =>
      `Beep. You have been motionless for ${m} minutes. Impressive, for a houseplant.${task(c, 'Required action:')}`,
    nag: (m) => `${m} minutes. My battery has more energy than you. Move.`,
    praise: ['Movement detected. I am almost impressed.', 'Task complete. Your chair can rest now.', 'Beep boop. Adequate.'],
    levelUp: (t) => `Upgrade installed. Designation: ${t}.`,
    badge: (n) => `Achievement ${n} unlocked. I will add it to your file.`,
    card: (t) => `${t} executed successfully.`,
    cheer: { half: '50 percent complete. Try not to fall over.', end: 'Five seconds remaining. Probably.' },
  },
  {
    id: 'pirate',
    name: 'Captain Pip',
    emoji: '🏴‍☠️',
    unlockLevel: 5,
    pitch: 0.9,
    rate: 1.0,
    hello: 'Ahoy, matey! Captain Pip at yer service. No landlubbers on my ship!',
    remind: (m, c) => `Arr! ${m} minutes anchored to that chair, matey! All hands on deck!${task(c, 'Yer quest:')}`,
    nag: (m) => `${m} minutes! Ye be turning into a barnacle! Hoist yerself up!`,
    praise: ['Yo ho ho! Well done, matey!', 'Shiver me timbers, that was fine work!', 'Arr, a true sailor!'],
    levelUp: (t) => `Ye've been promoted to ${t}! Raise the flag!`,
    badge: (n) => `Treasure found: the ${n} badge!`,
    card: (t) => `${t}, plundered!`,
    cheer: { half: 'Halfway across the seas, matey!', end: 'Five more seconds! Land ho!' },
  },
  {
    id: 'zen',
    name: 'Zen Master',
    emoji: '🧘',
    unlockLevel: 6,
    pitch: 1.0,
    rate: 0.8,
    hello: 'Welcome. Together, we will find balance between sitting and moving.',
    remind: (m, c) => `Breathe in. You have been still for ${m} minutes. The body wishes to move.${task(c, 'Gently:')}`,
    nag: (m) => `${m} minutes. The river does not sit still. Neither should you.`,
    praise: ['Balance restored.', 'Well done. Feel the energy flow.', 'Peaceful and strong.'],
    levelUp: (t) => `You have grown. You are now ${t}.`,
    badge: (n) => `The ${n} badge. A step on the path.`,
    card: (t) => `${t}, complete. Namaste.`,
    cheer: { half: 'Halfway. Keep breathing.', end: 'Five more breaths of time.' },
  },
];

export function voiceById(id: string | null | undefined): Voice {
  return VOICES.find((v) => v.id === id) ?? VOICES[0];
}

export function pickLine(lines: string[]) {
  return lines[Math.floor(Math.random() * lines.length)];
}
