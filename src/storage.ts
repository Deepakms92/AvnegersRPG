import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'move-reminder-state-v1';

export type PersistedState = {
  intervalMin: number;
  enabled: boolean;
  /** Epoch ms of the last time the user moved (or the timer was reset). */
  lastMovedAt: number;
  autoDetectSteps: boolean;
};

export const DEFAULT_STATE: PersistedState = {
  intervalMin: 45,
  enabled: false,
  lastMovedAt: Date.now(),
  autoDetectSteps: true,
};

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
