import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { Pedometer } from 'expo-sensors';

import {
  alertLoudly,
  cancelReminders,
  configureNotificationHandler,
  pickPhrase,
  praise,
  requestNotificationPermission,
  scheduleReminders,
  setupAndroidChannel,
  stopAlert,
} from './src/reminder';
import { DEFAULT_STATE, loadState, PersistedState, saveState } from './src/storage';

configureNotificationHandler();

const INTERVAL_OPTIONS = [1, 15, 30, 45, 60, 90];
/** While overdue and the app is open, repeat the spoken alert this often. */
const REPEAT_ALERT_MS = 60_000;
/** Steps that count as "I moved" and auto-reset the timer. */
const STEP_THRESHOLD = 30;

function formatRemaining(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function App() {
  const [state, setState] = useState<PersistedState>(DEFAULT_STATE);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [stepsSinceReset, setStepsSinceReset] = useState(0);
  const [pedometerAvailable, setPedometerAvailable] = useState<boolean | null>(null);
  const lastSpokenAt = useRef(0);
  const appActive = useRef(AppState.currentState === 'active');

  const dueAt = state.lastMovedAt + state.intervalMin * 60_000;
  const overdue = state.enabled && now >= dueAt;
  const sittingMin = Math.floor((now - state.lastMovedAt) / 60_000);

  const update = useCallback((patch: Partial<PersistedState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      saveState(next);
      return next;
    });
  }, []);

  // Load persisted state and re-arm the schedule on launch.
  useEffect(() => {
    (async () => {
      // Load state first so the UI never gets stuck if notification setup fails.
      const s = await loadState();
      setState(s);
      setLoaded(true);
      try {
        await setupAndroidChannel();
        if (s.enabled) {
          await scheduleReminders(s.lastMovedAt + s.intervalMin * 60_000, s.intervalMin);
        }
      } catch (e) {
        console.warn('[move-reminder] Could not schedule reminders on launch.', e);
      }
    })();
  }, []);

  // 1-second clock for the countdown.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Track whether the app is in the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      appActive.current = s === 'active';
      if (s === 'active') setNow(Date.now());
    });
    return () => sub.remove();
  }, []);

  const speakIfDue = useCallback(
    (minutes: number, force = false) => {
      const t = Date.now();
      if (!force && t - lastSpokenAt.current < REPEAT_ALERT_MS) return;
      lastSpokenAt.current = t;
      alertLoudly(pickPhrase(Math.max(1, minutes)));
    },
    [],
  );

  // When overdue and the app is open, shout (and repeat every minute).
  useEffect(() => {
    if (overdue && appActive.current) speakIfDue(sittingMin);
  }, [overdue, now, sittingMin, speakIfDue]);

  // If a scheduled notification arrives while the app is open, speak it too.
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((n) => {
      if (n.request.content.data?.kind === 'move-reminder') {
        const min = Number(n.request.content.data?.sittingMin ?? state.intervalMin);
        speakIfDue(min);
      }
    });
    return () => sub.remove();
  }, [speakIfDue, state.intervalMin]);

  const markMoved = useCallback(
    async (auto = false) => {
      stopAlert();
      const t = Date.now();
      lastSpokenAt.current = 0;
      setStepsSinceReset(0);
      update({ lastMovedAt: t });
      setNow(t);
      if (state.enabled) {
        await cancelReminders();
        await scheduleReminders(t + state.intervalMin * 60_000, state.intervalMin);
      }
      if (auto || state.enabled) praise();
    },
    [state.enabled, state.intervalMin, update],
  );

  // Step detection: walking around auto-resets the timer.
  useEffect(() => {
    if (!state.enabled || !state.autoDetectSteps) return;
    let sub: { remove: () => void } | undefined;
    let baseline: number | null = null;
    let cancelled = false;
    (async () => {
      const available = await Pedometer.isAvailableAsync().catch(() => false);
      setPedometerAvailable(available);
      if (!available || cancelled) return;
      const perm = await Pedometer.requestPermissionsAsync().catch(() => null);
      if (!perm?.granted || cancelled) return;
      sub = Pedometer.watchStepCount(({ steps }) => {
        if (baseline === null) baseline = steps;
        const delta = steps - baseline;
        setStepsSinceReset(delta);
        if (delta >= STEP_THRESHOLD) {
          baseline = steps;
          markMoved(true);
        }
      });
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [state.enabled, state.autoDetectSteps, markMoved]);

  const toggleEnabled = async (value: boolean) => {
    if (value) {
      const t = Date.now();
      update({ enabled: true, lastMovedAt: t });
      setNow(t);
      try {
        const ok = await requestNotificationPermission();
        setPermissionDenied(!ok);
        await setupAndroidChannel();
        await scheduleReminders(t + state.intervalMin * 60_000, state.intervalMin);
      } catch (e) {
        console.warn('[move-reminder] Could not schedule reminders.', e);
      }
    } else {
      stopAlert();
      update({ enabled: false });
      await cancelReminders();
    }
  };

  const changeInterval = async (min: number) => {
    const t = Date.now();
    update({ intervalMin: min, lastMovedAt: t });
    setNow(t);
    if (state.enabled) await scheduleReminders(t + min * 60_000, min);
  };

  if (!loaded) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.subtle}>Loading…</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, overdue && styles.rootAlert]}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Move Reminder</Text>
        <Text style={styles.subtle}>Shouts at you when you've been sitting too long.</Text>

        <View style={[styles.timerCard, overdue && styles.timerCardAlert]}>
          {!state.enabled ? (
            <>
              <Text style={styles.timerLabel}>Reminders are off</Text>
              <Text style={styles.timer}>--:--</Text>
            </>
          ) : overdue ? (
            <>
              <Text style={styles.alertHeadline}>TIME TO MOVE!</Text>
              <Text style={styles.timerLabel}>Sitting for {sittingMin} min</Text>
            </>
          ) : (
            <>
              <Text style={styles.timerLabel}>Next reminder in</Text>
              <Text style={styles.timer}>{formatRemaining(dueAt - now)}</Text>
              <Text style={styles.subtle}>Sitting for {sittingMin} min</Text>
            </>
          )}
        </View>

        <Pressable
          style={({ pressed }) => [styles.bigButton, pressed && styles.pressed]}
          onPress={() => markMoved(false)}
        >
          <Text style={styles.bigButtonText}>I moved! Reset timer</Text>
        </Pressable>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>Reminders enabled</Text>
          <Switch value={state.enabled} onValueChange={toggleEnabled} />
        </View>
        {permissionDenied && (
          <Text style={styles.warning}>
            Notification permission denied. You'll only get alerts while the app is open.
          </Text>
        )}

        <Text style={styles.section}>Remind me after sitting for</Text>
        <View style={styles.chips}>
          {INTERVAL_OPTIONS.map((min) => (
            <Pressable
              key={min}
              onPress={() => changeInterval(min)}
              style={[styles.chip, state.intervalMin === min && styles.chipActive]}
            >
              <Text style={[styles.chipText, state.intervalMin === min && styles.chipTextActive]}>
                {min === 1 ? '1 min (test)' : `${min} min`}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Auto-reset when I walk</Text>
            <Text style={styles.subtle}>
              {pedometerAvailable === false
                ? 'Step counter not available on this device'
                : `${STEP_THRESHOLD} steps counts as moving (${stepsSinceReset} so far)`}
            </Text>
          </View>
          <Switch
            value={state.autoDetectSteps}
            onValueChange={(v) => update({ autoDetectSteps: v })}
          />
        </View>

        <Pressable
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          onPress={() => speakIfDue(Math.max(1, sittingMin), true)}
        >
          <Text style={styles.secondaryButtonText}>🔊 Test the loud alert</Text>
        </Pressable>

        <Text style={styles.footnote}>
          Tip: turn your media volume up for the spoken alert. Background alerts use the alarm
          sound stream, which is loud even when media volume is low.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#101418' },
  rootAlert: { backgroundColor: '#3A0D0D' },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, paddingTop: 64, gap: 16 },
  title: { color: '#FFFFFF', fontSize: 30, fontWeight: '800' },
  subtle: { color: '#9AA4AE', fontSize: 14 },
  timerCard: {
    backgroundColor: '#1B232B',
    borderRadius: 24,
    paddingVertical: 36,
    alignItems: 'center',
    gap: 6,
  },
  timerCardAlert: { backgroundColor: '#D32F2F' },
  timerLabel: { color: '#E0E6EB', fontSize: 16 },
  timer: { color: '#FFFFFF', fontSize: 64, fontWeight: '800', fontVariant: ['tabular-nums'] },
  alertHeadline: { color: '#FFFFFF', fontSize: 40, fontWeight: '900' },
  bigButton: {
    backgroundColor: '#2E7D32',
    borderRadius: 18,
    paddingVertical: 20,
    alignItems: 'center',
  },
  bigButtonText: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  pressed: { opacity: 0.75 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1B232B',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  rowLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  warning: { color: '#FFB74D', fontSize: 14 },
  section: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#3A4753',
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  chipActive: { backgroundColor: '#FF7043', borderColor: '#FF7043' },
  chipText: { color: '#C8D1D9', fontSize: 14 },
  chipTextActive: { color: '#FFFFFF', fontWeight: '700' },
  secondaryButton: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#3A4753',
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  footnote: { color: '#6F7A84', fontSize: 12, marginTop: 8 },
});
