import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { Pedometer } from 'expo-sensors';
import { LinearGradient } from 'expo-linear-gradient';
import {
  useFonts,
  Fredoka_400Regular,
  Fredoka_500Medium,
  Fredoka_600SemiBold,
  Fredoka_700Bold,
} from '@expo-google-fonts/fredoka';

import {
  alertLoudly,
  cancelReminders,
  configureNotificationHandler,
  pickPhrase,
  requestNotificationPermission,
  say,
  scheduleReminders,
  setupAndroidChannel,
  stopAlert,
} from './src/reminder';
import { DEFAULT_STATE, loadState, PersistedState, saveState } from './src/storage';
import {
  BADGES,
  DAILY_GOAL,
  DEFAULT_STATS,
  GameStats,
  levelInfo,
  loadStats,
  recordMove,
  saveStats,
} from './src/game';
import {
  Avatar,
  C,
  Card,
  ChunkyButton,
  energyColor,
  F,
  Pulse,
  RewardToast,
  SegmentBar,
  ThinBar,
  Toast,
} from './src/ui';

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

function mood(energy: number, enabled: boolean, overdue: boolean) {
  if (!enabled) return { emoji: '😴', text: 'Snoozing — turn reminders on to play' };
  if (overdue) return { emoji: '🧟', text: 'ZOMBIE MODE! Get up and move!' };
  if (energy > 0.75) return { emoji: '😄', text: 'Fully charged' };
  if (energy > 0.5) return { emoji: '🙂', text: 'Feeling good' };
  if (energy > 0.25) return { emoji: '😐', text: 'Getting a bit stiff…' };
  return { emoji: '🥱', text: 'Running low on energy' };
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Fredoka_400Regular,
    Fredoka_500Medium,
    Fredoka_600SemiBold,
    Fredoka_700Bold,
  });
  const [state, setState] = useState<PersistedState>(DEFAULT_STATE);
  const [stats, setStats] = useState<GameStats>(DEFAULT_STATS);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [stepsSinceReset, setStepsSinceReset] = useState(0);
  const [pedometerAvailable, setPedometerAvailable] = useState<boolean | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const lastSpokenAt = useRef(0);
  const appActive = useRef(AppState.currentState === 'active');
  const statsRef = useRef(stats);
  statsRef.current = stats;

  const intervalMs = state.intervalMin * 60_000;
  const dueAt = state.lastMovedAt + intervalMs;
  const overdue = state.enabled && now >= dueAt;
  const sittingMin = Math.floor((now - state.lastMovedAt) / 60_000);
  const energy = state.enabled ? Math.max(0, Math.min(1, (dueAt - now) / intervalMs)) : 1;
  const lvl = levelInfo(stats.xp);
  const m = mood(energy, state.enabled, overdue);

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
      const [s, g] = await Promise.all([loadState(), loadStats()]);
      setState(s);
      setStats(g);
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

  const speakIfDue = useCallback((minutes: number, force = false) => {
    const t = Date.now();
    if (!force && t - lastSpokenAt.current < REPEAT_ALERT_MS) return;
    lastSpokenAt.current = t;
    alertLoudly(pickPhrase(Math.max(1, minutes)));
  }, []);

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
    async (viaSteps = false) => {
      stopAlert();
      const t = Date.now();
      lastSpokenAt.current = 0;
      setStepsSinceReset(0);

      if (state.enabled) {
        const result = recordMove(statsRef.current, {
          now: t,
          overdueByMs: t - (state.lastMovedAt + state.intervalMin * 60_000),
          viaSteps,
        });
        setStats(result.stats);
        saveStats(result.stats);

        if (result.leveledUp) {
          const li = levelInfo(result.stats.xp);
          setToast({
            id: t,
            title: `LEVEL ${li.level}!`,
            lines: [li.title, ...result.reasons],
            color: C.gold,
          });
          say(`Level up! You are now a ${li.title}.`);
        } else if (result.newBadges.length) {
          const b = result.newBadges[0];
          setToast({ id: t, title: `${b.icon} ${b.name}`, lines: ['Badge unlocked!', ...result.reasons], color: C.pink });
          say(`Badge unlocked: ${b.name}!`);
        } else if (result.xpGained > 0) {
          setToast({ id: t, title: `+${result.xpGained} XP`, lines: result.reasons, color: C.lime });
          say(viaSteps ? 'Nice walk! Energy restored.' : 'Nice! Energy restored.');
        } else {
          setToast({ id: t, title: 'Energy restored', lines: ['XP cooldown — move again later'], color: C.cyan });
          say('Energy restored.');
        }
      }

      update({ lastMovedAt: t });
      setNow(t);
      if (state.enabled) {
        try {
          await cancelReminders();
          await scheduleReminders(t + state.intervalMin * 60_000, state.intervalMin);
        } catch (e) {
          console.warn('[move-reminder] Could not reschedule reminders.', e);
        }
      }
    },
    [state.enabled, state.intervalMin, state.lastMovedAt, update],
  );

  // Step detection: walking around auto-resets the timer.
  const markMovedRef = useRef(markMoved);
  markMovedRef.current = markMoved;
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
          markMovedRef.current(true);
        }
      });
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [state.enabled, state.autoDetectSteps]);

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

  const gradient = overdue ? ([C.alertTop, C.alertBottom] as const) : ([C.bgTop, C.bgBottom] as const);

  if (!loaded || !fontsLoaded) {
    return (
      <LinearGradient colors={[C.bgTop, C.bgBottom]} style={[styles.root, styles.center]}>
        <Text style={{ fontSize: 48 }}>🏃</Text>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={gradient} style={styles.root}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header: level + XP + streak */}
        <View style={styles.header}>
          <View style={styles.levelBadge}>
            <Text style={styles.levelLabel}>LV</Text>
            <Text style={styles.levelNum}>{lvl.level}</Text>
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={styles.playerTitle}>{lvl.title}</Text>
            <ThinBar value={lvl.progress} color={C.cyan} />
            <Text style={styles.xpText}>
              {lvl.intoLevel} / {lvl.levelSize} XP
            </Text>
          </View>
          <View style={styles.streakPill}>
            <Text style={styles.streakIcon}>🔥</Text>
            <Text style={styles.streakNum}>{stats.streak}</Text>
          </View>
        </View>

        {/* Hero: avatar + energy */}
        <Card style={[styles.hero, overdue && styles.heroAlert]}>
          <Avatar emoji={m.emoji} alarm={overdue} />
          <Text style={[styles.moodText, overdue && { color: C.red }]}>{m.text}</Text>

          <View style={styles.energyRow}>
            <Text style={styles.energyLabel}>⚡ ENERGY</Text>
            <Text style={[styles.energyPct, { color: energyColor(energy) }]}>{Math.round(energy * 100)}%</Text>
          </View>
          <SegmentBar value={energy} color={energyColor(energy)} />

          <Text style={styles.timer}>
            {!state.enabled ? '--:--' : overdue ? `+${formatRemaining(now - dueAt)}` : formatRemaining(dueAt - now)}
          </Text>
          <Text style={styles.timerCaption}>
            {!state.enabled
              ? 'reminders off'
              : overdue
                ? `overdue · sitting ${sittingMin} min`
                : `until energy runs out · sitting ${sittingMin} min`}
          </Text>
        </Card>

        {/* Main action */}
        {state.enabled ? (
          <Pulse active={overdue}>
            <ChunkyButton
              big
              label="I MOVED!"
              sublabel={overdue ? 'Quick! Bonus XP for moving now' : 'Restore energy · earn XP'}
              face={overdue ? C.gold : C.lime}
              edge={overdue ? C.goldEdge : C.limeEdge}
              onPress={() => markMoved(false)}
            />
          </Pulse>
        ) : (
          <ChunkyButton
            big
            label="START PLAYING"
            sublabel="Turn on movement reminders"
            face={C.purple}
            edge={C.purpleEdge}
            textColor="#FFFFFF"
            onPress={() => toggleEnabled(true)}
          />
        )}
        {permissionDenied && (
          <Text style={styles.warning}>
            Notifications are blocked, so you'll only get alerts while the app is open.
          </Text>
        )}

        {/* Daily quest */}
        <Card>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>🎯 Daily quest</Text>
            <Text style={styles.cardMeta}>
              {Math.min(stats.movesToday, DAILY_GOAL)}/{DAILY_GOAL} moves
            </Text>
          </View>
          <View style={styles.pips}>
            {Array.from({ length: DAILY_GOAL }, (_, i) => (
              <View key={i} style={[styles.pip, i < stats.movesToday && styles.pipOn]}>
                <Text style={[styles.pipText, i >= stats.movesToday && { color: C.dim }]}>
                  {i < stats.movesToday ? '✓' : i + 1}
                </Text>
              </View>
            ))}
          </View>
          <Text style={styles.cardHint}>
            {stats.movesToday >= DAILY_GOAL
              ? 'Quest complete! Your streak is safe today. 🔥'
              : `Hit ${DAILY_GOAL} moves today for +50 XP and to keep your streak.`}
          </Text>
        </Card>

        {/* Stats */}
        <View style={styles.statsRow}>
          <Stat icon="🏃" value={stats.totalMoves} label="Moves" />
          <Stat icon="⭐" value={stats.xp} label="Total XP" />
          <Stat icon="🏆" value={stats.badges.length} label="Badges" />
        </View>

        {/* Badges */}
        <Card>
          <Text style={styles.cardTitle}>🏆 Badges</Text>
          <View style={styles.badgeGrid}>
            {BADGES.map((b) => {
              const got = stats.badges.includes(b.id);
              return (
                <View key={b.id} style={[styles.badge, got && styles.badgeOn]}>
                  <Text style={[styles.badgeIcon, !got && { opacity: 0.25 }]}>{got ? b.icon : '🔒'}</Text>
                  <Text style={[styles.badgeName, !got && { color: C.dim }]} numberOfLines={1}>
                    {b.name}
                  </Text>
                  <Text style={styles.badgeHint} numberOfLines={2}>
                    {b.hint}
                  </Text>
                </View>
              );
            })}
          </View>
        </Card>

        {/* Settings */}
        <Card>
          <Pressable style={styles.rowBetween} onPress={() => setShowSettings((v) => !v)}>
            <Text style={styles.cardTitle}>⚙️ Game settings</Text>
            <Text style={styles.cardMeta}>{showSettings ? '▲' : '▼'}</Text>
          </Pressable>

          {showSettings && (
            <View style={{ gap: 16, marginTop: 14 }}>
              <View style={styles.rowBetween}>
                <Text style={styles.settingLabel}>Reminders</Text>
                <Switch
                  value={state.enabled}
                  onValueChange={toggleEnabled}
                  trackColor={{ true: C.lime, false: '#3A3566' }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <View style={{ gap: 8 }}>
                <Text style={styles.settingLabel}>Energy lasts</Text>
                <View style={styles.chips}>
                  {INTERVAL_OPTIONS.map((min) => {
                    const on = state.intervalMin === min;
                    return (
                      <Pressable key={min} onPress={() => changeInterval(min)} style={[styles.chip, on && styles.chipOn]}>
                        <Text style={[styles.chipText, on && styles.chipTextOn]}>
                          {min === 1 ? '1 min 🧪' : `${min} min`}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingLabel}>Walking restores energy</Text>
                  <Text style={styles.cardHint}>
                    {pedometerAvailable === false
                      ? 'No step counter on this device'
                      : `${STEP_THRESHOLD} steps = a move (${stepsSinceReset} so far)`}
                  </Text>
                </View>
                <Switch
                  value={state.autoDetectSteps}
                  onValueChange={(v) => update({ autoDetectSteps: v })}
                  trackColor={{ true: C.lime, false: '#3A3566' }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <ChunkyButton
                label="🔊 Test the loud alert"
                face="#3A3566"
                edge="#1F1B44"
                textColor="#FFFFFF"
                onPress={() => speakIfDue(Math.max(1, sittingMin), true)}
              />
            </View>
          )}
        </Card>

        <Text style={styles.footnote}>
          Moves less than 5 min apart restore energy but don't earn XP.
        </Text>
      </ScrollView>

      <RewardToast toast={toast} />
    </LinearGradient>
  );
}

function Stat({ icon, value, label }: { icon: string; value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingTop: 56, paddingBottom: 40, gap: 16 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  levelBadge: {
    width: 58,
    height: 58,
    borderRadius: 16,
    backgroundColor: C.purple,
    borderBottomWidth: 5,
    borderBottomColor: C.purpleEdge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelLabel: { fontFamily: F.semibold, color: '#E3D9FF', fontSize: 11, lineHeight: 12 },
  levelNum: { fontFamily: F.bold, color: C.text, fontSize: 24, lineHeight: 28 },
  playerTitle: { fontFamily: F.bold, color: C.text, fontSize: 20 },
  xpText: { fontFamily: F.medium, color: C.muted, fontSize: 12 },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(255,138,59,0.18)',
    borderColor: 'rgba(255,138,59,0.5)',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  streakIcon: { fontSize: 18 },
  streakNum: { fontFamily: F.bold, color: C.orange, fontSize: 18 },

  hero: { alignItems: 'center', gap: 10, paddingVertical: 22 },
  heroAlert: { borderColor: C.red, borderWidth: 2, backgroundColor: 'rgba(255,59,92,0.12)' },
  moodText: { fontFamily: F.semibold, color: C.text, fontSize: 18, textAlign: 'center' },
  energyRow: { flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch', marginTop: 6 },
  energyLabel: { fontFamily: F.bold, color: C.muted, fontSize: 13, letterSpacing: 1.5 },
  energyPct: { fontFamily: F.bold, fontSize: 13 },
  timer: { fontFamily: F.bold, color: C.text, fontSize: 56, fontVariant: ['tabular-nums'], marginTop: 6 },
  timerCaption: { fontFamily: F.medium, color: C.muted, fontSize: 13, marginTop: -6 },

  warning: { fontFamily: F.medium, color: C.gold, fontSize: 13, textAlign: 'center' },

  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  cardTitle: { fontFamily: F.bold, color: C.text, fontSize: 17 },
  cardMeta: { fontFamily: F.semibold, color: C.muted, fontSize: 14 },
  cardHint: { fontFamily: F.regular, color: C.muted, fontSize: 13, marginTop: 4 },

  pips: { flexDirection: 'row', gap: 8, marginTop: 12 },
  pip: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1,
    borderColor: C.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pipOn: { backgroundColor: C.lime, borderColor: C.lime },
  pipText: { fontFamily: F.bold, color: '#10210A', fontSize: 15 },

  statsRow: { flexDirection: 'row', gap: 10 },
  stat: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: C.card,
    borderColor: C.cardBorder,
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 12,
  },
  statIcon: { fontSize: 20 },
  statValue: { fontFamily: F.bold, color: C.text, fontSize: 22 },
  statLabel: { fontFamily: F.medium, color: C.muted, fontSize: 12 },

  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  badge: {
    width: '23%',
    flexGrow: 1,
    minWidth: 70,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 14,
    padding: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  badgeOn: { borderColor: 'rgba(255,210,59,0.6)', backgroundColor: 'rgba(255,210,59,0.12)' },
  badgeIcon: { fontSize: 26 },
  badgeName: { fontFamily: F.semibold, color: C.text, fontSize: 11, marginTop: 2 },
  badgeHint: { fontFamily: F.regular, color: C.dim, fontSize: 9, textAlign: 'center' },

  settingLabel: { fontFamily: F.semibold, color: C.text, fontSize: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.cardBorder,
    backgroundColor: 'rgba(0,0,0,0.25)',
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  chipOn: { backgroundColor: C.cyan, borderColor: C.cyan },
  chipText: { fontFamily: F.semibold, color: C.muted, fontSize: 14 },
  chipTextOn: { color: '#06202A' },

  footnote: { fontFamily: F.regular, color: C.dim, fontSize: 12, textAlign: 'center' },
});
