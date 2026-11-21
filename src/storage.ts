import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_SCHEDULE, WorkSchedule } from './schedule';

// Storage key kept from the app's first version so existing progress survives.
const KEY = 'move-reminder-state-v1';

export type PersistedState = {
  intervalMin: number;
  enabled: boolean;
  /** Epoch ms of the last time the user moved (or the timer was reset). */
  lastMovedAt: number;
  autoDetectSteps: boolean;
  /** Epoch ms until which alerts are snoozed (0 = not snoozed). */
  snoozeUntil: number;
  /** Last notification button press handled, so it is never counted twice. */
  lastHandledResponse: string | null;
  schedule: WorkSchedule;
  /** The challenge card dealt for the current sitting session. */
  cardId: string | null;
  voiceId: string;
  hatId: string;
};

export const DEFAULT_STATE: PersistedState = {
  intervalMin: 45,
  enabled: false,
  lastMovedAt: Date.now(),
  autoDetectSteps: true,
  snoozeUntil: 0,
  lastHandledResponse: null,
  schedule: DEFAULT_SCHEDULE,
  cardId: null,
  voiceId: 'coach',
  hatId: 'none',
};

export async function loadState(): Promise<PersistedState> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_STATE, ...parsed, schedule: { ...DEFAULT_SCHEDULE, ...parsed.schedule } };
  } catch {
    return DEFAULT_STATE;
  }
}

export async function saveState(state: PersistedState) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Non-fatal for a POC.
  }
}
