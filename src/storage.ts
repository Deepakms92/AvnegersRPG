import AsyncStorage from '@react-native-async-storage/async-storage';

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
};

export const DEFAULT_STATE: PersistedState = {
  intervalMin: 45,
  enabled: false,
  lastMovedAt: Date.now(),
  autoDetectSteps: true,
  snoozeUntil: 0,
  lastHandledResponse: null,
};

/** When the next alert is due: the end of the sitting interval, or the end of a snooze. */
export function nextDueAt(s: PersistedState) {
  return Math.max(s.lastMovedAt + s.intervalMin * 60_000, s.snoozeUntil);
}

export async function loadState(): Promise<PersistedState> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_STATE;
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
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
