import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
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
  configureAudio,
  configureNotificationHandler,
  reminderLine,
  requestNotificationPermission,
  say,
  setupNotifications,
  stopAlert,
} from './src/reminder';
import { DEFAULT_STATE, loadState, PersistedState, saveState } from './src/storage';
import { applyMove, describeMove, handleNotificationResponse, MoveSummary, reschedule } from './src/moveService';
import { BADGES, DAILY_GOAL, DEFAULT_STATS, GameStats, levelInfo, loadStats } from './src/game';
import { CARDS, cardById, drawCard, RARITY } from './src/cards';
import { CardCollection, CardTeaser, ChallengeCardView } from './src/cardsUI';
import { Buddy } from './src/buddy';
import { BuddyMood, HATS, hatUnlocked, stageFor } from './src/buddyData';
import { VOICES, voiceById } from './src/voices';
import { StatsPanel } from './src/statsUI';
import { DAY_LETTERS, formatClock, formatWhen, isWorkday, timerView, WorkSchedule } from './src/schedule';
import {
  Avatar,
  C,
  Card,
  ChunkyButton,
  energyColor,
  F,
  Pulse,
  RewardToast,
  Section,
  SegmentBar,
  ThinBar,
  Toast,
} from './src/ui';

configureNotificationHandler();

/** Notification responses don't exist on web (used only for browser previews). */
const useLastResponse =
  Platform.OS === 'web' ? () => undefined : Notifications.useLastNotificationResponse;

const INTERVAL_OPTIONS = [1, 15, 30, 45, 60, 90];
/** While overdue and the app is open, repeat the spoken alert this often. */
const REPEAT_ALERT_MS = 60_000;
/** Steps that count as "I moved" and auto-reset the timer. */
const STEP_THRESHOLD = 30;
/**
 * iOS only: steps walked while the app was closed (read from the phone's step
 * history on return) that count as a move. Higher than the live threshold so
 * small shuffles around the desk don't count.
 */
const CATCH_UP_STEPS = 100;
const TIME_STEP_MIN = 30;

function formatRemaining(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
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
  const lastSpokenAt = useRef(0);
  const appActive = useRef(AppState.currentState === 'active');
  const stateRef = useRef(state);
  stateRef.current = state;

  const tv = timerView(state, now);
  const lvl = levelInfo(stats.xp);
  const voice = voiceById(state.voiceId);
  const card = cardById(state.cardId);
  const stage = stageFor(lvl.level);
  const cardsOwned = Object.keys(stats.cards).length;
  const dayOff = state.schedule.enabled && !isWorkday(now, state.schedule);

  const buddyMood: BuddyMood =
    !state.enabled || tv.offDuty
      ? 'sleep'
      : tv.overdue
        ? 'zombie'
        : tv.snoozed || tv.energy <= 0.35
          ? 'tired'
          : tv.energy > 0.6
            ? 'happy'
            : 'ok';
  const moodText = !state.enabled
    ? `${stage.name} is napping. Turn reminders on to play`
    : tv.offDuty
      ? `Off duty 😎 Back ${tv.nextStart ? formatWhen(tv.nextStart, now) : 'on your next work day'}`
      : tv.overdue
        ? 'ZOMBIE MODE! Get up and move!'
        : tv.snoozed
          ? 'Snoozed. Move soon!'
          : tv.energy > 0.6
            ? 'Fully charged'
            : tv.energy > 0.35
              ? 'Feeling good'
              : 'Getting stiff…';

  /** Save a change; optionally restart the sitting timer with a fresh card. Reschedules reminders. */
  const applyPatch = useCallback(async (patch: Partial<PersistedState>, opts: { resetTimer?: boolean } = {}) => {
    const t = Date.now();
    const next: PersistedState = {
      ...stateRef.current,
      ...patch,
      ...(opts.resetTimer ? { lastMovedAt: t, snoozeUntil: 0, cardId: drawCard().id } : {}),
    };
    stateRef.current = next;
    setState(next);
    setNow(t);
    await saveState(next);
    if (next.enabled) await reschedule(next);
    else await cancelReminders().catch(() => {});
  }, []);

  // Load persisted state and re-arm the schedule on launch.
  useEffect(() => {
    (async () => {
      // Load state first so the UI never gets stuck if notification setup fails.
      let s = await loadState();
      if (!s.cardId) {
        s = { ...s, cardId: drawCard().id };
        await saveState(s);
      }
      setState(s);
      setStats(await loadStats(s.schedule));
      setLoaded(true);
      try {
        await configureAudio();
        await setupNotifications();
        if (s.enabled) await reschedule(s);
      } catch (e) {
        console.warn('[wellping] Could not schedule reminders on launch.', e);
      }
    })();
  }, []);

  // 1-second clock for the countdown.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  /** Re-read saved progress (a notification button may have changed it while we were away). */
  const reload = useCallback(async () => {
    const s = await loadState();
    setState(s);
    setStats(await loadStats(s.schedule));
    setNow(Date.now());
  }, []);

  const speakIfDue = useCallback((minutes: number, force = false) => {
    const t = Date.now();
    if (!force && t - lastSpokenAt.current < REPEAT_ALERT_MS) return;
    lastSpokenAt.current = t;
    const s = stateRef.current;
    alertLoudly(reminderLine(s, minutes), voiceById(s.voiceId));
  }, []);

  // When overdue and the app is open, shout (and repeat every minute).
  useEffect(() => {
    if (tv.overdue && appActive.current) speakIfDue(tv.sittingMin);
  }, [tv.overdue, now, tv.sittingMin, speakIfDue]);

  // If a scheduled notification arrives while the app is open, speak it too.
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((n) => {
      if (n.request.content.data?.kind === 'move-reminder') {
        speakIfDue(Number(n.request.content.data?.sittingMin ?? stateRef.current.intervalMin));
      }
    });
    return () => sub.remove();
  }, [speakIfDue]);

  const celebrate = useCallback((d: MoveSummary) => {
    const color = { level: C.gold, badge: C.pink, card: C.purple, xp: C.lime, plain: C.cyan }[d.kind];
    setToast({ id: Date.now(), title: d.title, lines: d.lines, color });
    say(d.speech, voiceById(stateRef.current.voiceId));
  }, []);

  const markMoved = useCallback(
    async (viaSteps = false) => {
      stopAlert();
      lastSpokenAt.current = 0;
      setStepsSinceReset(0);
      try {
        const voiceBefore = voiceById(stateRef.current.voiceId);
        const { state: next, result } = await applyMove({ viaSteps });
        stateRef.current = next;
        setState(next);
        if (result) setStats(result.stats);
        setNow(Date.now());
        if (next.enabled) celebrate(describeMove(result, viaSteps, voiceBefore));
      } catch (e) {
        console.warn('[wellping] Could not record move.', e);
      }
    },
    [celebrate],
  );

  // "I moved!" / "Snooze" tapped on a notification. This also catches a tap that
  // launched the app (always the case on iOS, where the buttons open the app).
  // On Android a background tap was already handled; the de-duplication skips it.
  const lastResponse = useLastResponse();
  useEffect(() => {
    if (!loaded || !lastResponse) return;
    (async () => {
      const handled = await handleNotificationResponse(lastResponse);
      if (!handled) return;
      stopAlert();
      await reload();
      if (handled.kind === 'moved') celebrate(describeMove(handled.result, false, voiceById(stateRef.current.voiceId)));
      else setToast({ id: Date.now(), title: '⏰ Snoozed', lines: ['5 more minutes'], color: C.cyan });
    })();
  }, [loaded, lastResponse, celebrate, reload]);

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

  /**
   * iOS can report steps walked while the app was closed. If you walked enough
   * since your last move, count it as a move when you come back to the app.
   * (Android has no step history here, so this is iOS only.)
   */
  const catchUpSteps = useCallback(async () => {
    if (Platform.OS !== 'ios') return;
    const s = await loadState();
    if (!s.enabled || !s.autoDetectSteps) return;
    try {
      if (!(await Pedometer.isAvailableAsync())) return;
      if (!(await Pedometer.getPermissionsAsync()).granted) return;
      const { steps } = await Pedometer.getStepCountAsync(new Date(s.lastMovedAt), new Date());
      if (steps >= CATCH_UP_STEPS) await markMovedRef.current(true);
    } catch (e) {
      console.warn('[wellping] Could not read step history.', e);
    }
  }, []);

  // When the app returns to the foreground: reload saved progress (a notification
  // button may have changed it), then count steps walked while away (iOS).
  useEffect(() => {
    if (!loaded) return;
    catchUpSteps();
    const sub = AppState.addEventListener('change', async (s) => {
      appActive.current = s === 'active';
      if (s !== 'active') return;
      await reload();
      await catchUpSteps();
    });
    return () => sub.remove();
  }, [loaded, reload, catchUpSteps]);

  const toggleEnabled = async (value: boolean) => {
    if (!value) {
      stopAlert();
      await applyPatch({ enabled: false });
      return;
    }
    try {
      const ok = await requestNotificationPermission();
      setPermissionDenied(!ok);
      await setupNotifications();
    } catch (e) {
      console.warn('[wellping] Could not set up notifications.', e);
    }
    await applyPatch({ enabled: true }, { resetTimer: true });
  };

  const updateSchedule = (patch: Partial<WorkSchedule>) =>
    applyPatch({ schedule: { ...stateRef.current.schedule, ...patch } });

  const chooseVoice = (id: string) => {
    const v = voiceById(id);
    if (lvl.level < v.unlockLevel) {
      setToast({ id: Date.now(), title: `${v.emoji} Locked`, lines: [`Unlocks at level ${v.unlockLevel}`], color: C.dim });
      return;
    }
    applyPatch({ voiceId: id });
    say(v.hello, v);
  };

  const chooseHat = (id: string) => {
    const hat = HATS.find((h) => h.id === id)!;
    if (!hatUnlocked(hat, lvl.level, stats)) {
      setToast({ id: Date.now(), title: `${hat.emoji} Locked`, lines: [hat.hint], color: C.dim });
      return;
    }
    applyPatch({ hatId: id });
  };

  const gradient = tv.overdue ? ([C.alertTop, C.alertBottom] as const) : ([C.bgTop, C.bgBottom] as const);

  if (!loaded || !fontsLoaded) {
    return (
      <LinearGradient colors={[C.bgTop, C.bgBottom]} style={[styles.root, styles.center]}>
        <Text style={{ fontSize: 48 }}>🏃</Text>
      </LinearGradient>
    );
  }

  const sched = state.schedule;

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

        {/* Hero: buddy + energy + challenge card */}
        <Card style={[styles.hero, tv.overdue && styles.heroAlert]}>
          <Avatar alarm={tv.overdue}>
            <Buddy level={lvl.level} mood={buddyMood} hatId={state.hatId} size={124} />
          </Avatar>
          <Text style={[styles.moodText, tv.overdue && { color: C.red }]}>{moodText}</Text>

          <View style={styles.energyRow}>
            <Text style={styles.energyLabel}>⚡ ENERGY</Text>
            <Text style={[styles.energyPct, { color: energyColor(tv.energy) }]}>{Math.round(tv.energy * 100)}%</Text>
          </View>
          <SegmentBar value={tv.energy} color={energyColor(tv.energy)} />

          <Text style={[styles.timer, tv.offDuty && styles.timerSmall]}>
            {!state.enabled
              ? '--:--'
              : tv.offDuty
                ? tv.nextStart
                  ? formatWhen(tv.nextStart, now)
                  : 'Day off'
                : tv.snoozed
                  ? formatRemaining(state.snoozeUntil - now)
                  : tv.overdue
                    ? `+${formatRemaining(now - tv.dueAt)}`
                    : formatRemaining(tv.dueAt - now)}
          </Text>
          <Text style={styles.timerCaption}>
            {!state.enabled
              ? 'reminders off'
              : tv.offDuty
                ? 'off duty · reminders start again then'
                : tv.snoozed
                  ? `snoozed · sitting ${tv.sittingMin} min`
                  : tv.overdue
                    ? `overdue · sitting ${tv.sittingMin} min`
                    : `until energy runs out · sitting ${tv.sittingMin} min`}
          </Text>

          {state.enabled && !tv.offDuty && card && (tv.overdue || tv.snoozed ? <ChallengeCardView card={card} /> : <CardTeaser />)}
        </Card>

        {/* Main action */}
        {state.enabled ? (
          <Pulse active={tv.overdue}>
            <ChunkyButton
              big
              label={tv.overdue || tv.snoozed ? 'CHALLENGE DONE!' : 'I MOVED!'}
              sublabel={tv.overdue ? 'Quick! Bonus XP for moving now' : 'Restore energy · earn XP'}
              face={tv.overdue ? C.gold : C.lime}
              edge={tv.overdue ? C.goldEdge : C.limeEdge}
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
              : dayOff
                ? "Day off 😎 Your streak is safe. Moves still earn XP."
                : `Hit ${DAILY_GOAL} moves today for +50 XP and to keep your streak.`}
          </Text>
        </Card>

        {/* Stats */}
        <View style={styles.statsRow}>
          <Stat icon="🏃" value={`${stats.totalMoves}`} label="Moves" />
          <Stat icon="⭐" value={`${stats.xp}`} label="Total XP" />
          <Stat icon="🎴" value={`${cardsOwned}/${CARDS.length}`} label="Cards" />
        </View>

        <Section title="📊 Your stats" meta="14 days">
          <StatsPanel stats={stats} />
        </Section>

        <Section title="🎴 Card collection" meta={`${cardsOwned}/${CARDS.length}`}>
          <CardCollection owned={stats.cards} />
          <Text style={styles.cardHint}>
            Chances per alert: {(['common', 'rare', 'epic', 'legendary'] as const)
              .map((r) => `${RARITY[r].icon} ${RARITY[r].weight}%`)
              .join('  ')}
          </Text>
        </Section>

        <Section title={`🐣 ${stage.name}`} meta={`Lv ${lvl.level}`}>
          <Text style={styles.cardHint}>
            {stage.next
              ? `Evolves into ${stage.next.name} at level ${stage.next.minLevel}.`
              : 'Fully evolved. Legendary!'}
          </Text>
          <Text style={[styles.settingLabel, { marginTop: 12 }]}>Hats</Text>
          <View style={[styles.chips, { marginTop: 8 }]}>
            {HATS.map((h) => {
              const unlocked = hatUnlocked(h, lvl.level, stats);
              const on = state.hatId === h.id;
              return (
                <Pressable
                  key={h.id}
                  onPress={() => chooseHat(h.id)}
                  style={[styles.chip, on && styles.chipOn, !unlocked && styles.chipLocked]}
                  accessibilityLabel={unlocked ? h.name : `${h.name}, locked. ${h.hint}`}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>
                    {unlocked ? h.emoji : '🔒'} {h.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        <Section title="🏆 Badges" meta={`${stats.badges.length}/${BADGES.length}`}>
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
        </Section>

        <Section title="🗣️ Voice" meta={`${voice.emoji} ${voice.name}`}>
          <View style={{ gap: 8 }}>
            {VOICES.map((v) => {
              const unlocked = lvl.level >= v.unlockLevel;
              const on = state.voiceId === v.id;
              return (
                <Pressable
                  key={v.id}
                  onPress={() => chooseVoice(v.id)}
                  style={[styles.voiceRow, on && styles.voiceRowOn, !unlocked && styles.chipLocked]}
                  accessibilityLabel={unlocked ? v.name : `${v.name}, locked until level ${v.unlockLevel}`}
                >
                  <Text style={styles.voiceEmoji}>{unlocked ? v.emoji : '🔒'}</Text>
                  <Text style={styles.voiceName}>{v.name}</Text>
                  <Text style={styles.voiceMeta}>{on ? '✓ Active' : unlocked ? 'Tap to hear' : `Lv ${v.unlockLevel}`}</Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        <Section title="⚙️ Settings">
          <View style={{ gap: 18 }}>
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
                    <Pressable
                      key={min}
                      onPress={() => applyPatch({ intervalMin: min }, { resetTimer: true })}
                      style={[styles.chip, on && styles.chipOn]}
                    >
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{min === 1 ? '1 min 🧪' : `${min} min`}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={{ gap: 10 }}>
              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingLabel}>Work hours only</Text>
                  <Text style={styles.cardHint}>No reminders outside these hours. Days off don't break your streak.</Text>
                </View>
                <Switch
                  value={sched.enabled}
                  onValueChange={(v) => updateSchedule({ enabled: v })}
                  trackColor={{ true: C.lime, false: '#3A3566' }}
                  thumbColor="#FFFFFF"
                />
              </View>
              {sched.enabled && (
                <>
                  <View style={styles.days}>
                    {DAY_LETTERS.map((letter, day) => {
                      const on = sched.days.includes(day);
                      return (
                        <Pressable
                          key={day}
                          onPress={() =>
                            updateSchedule({
                              days: on ? sched.days.filter((d) => d !== day) : [...sched.days, day].sort(),
                            })
                          }
                          style={[styles.day, on && styles.chipOn]}
                          accessibilityLabel={`${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day]}, ${on ? 'on' : 'off'}`}
                        >
                          <Text style={[styles.chipText, on && styles.chipTextOn]}>{letter}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <TimeStepper
                    label="Start"
                    minutes={sched.startMin}
                    onChange={(m) => updateSchedule({ startMin: m })}
                    min={0}
                    max={sched.endMin - TIME_STEP_MIN}
                  />
                  <TimeStepper
                    label="End"
                    minutes={sched.endMin}
                    onChange={(m) => updateSchedule({ endMin: m })}
                    min={sched.startMin + TIME_STEP_MIN}
                    max={24 * 60 - TIME_STEP_MIN}
                  />
                </>
              )}
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
                onValueChange={(v) => applyPatch({ autoDetectSteps: v })}
                trackColor={{ true: C.lime, false: '#3A3566' }}
                thumbColor="#FFFFFF"
              />
            </View>

            <ChunkyButton
              label="🔊 Test the loud alert"
              face="#3A3566"
              edge="#1F1B44"
              textColor="#FFFFFF"
              onPress={() => speakIfDue(Math.max(1, tv.sittingMin), true)}
            />
          </View>
        </Section>

        <Text style={styles.footnote}>Moves less than 5 min apart restore energy but don't earn XP.</Text>
      </ScrollView>

      <RewardToast toast={toast} />
    </LinearGradient>
  );
}

function Stat({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function TimeStepper({
  label,
  minutes,
  onChange,
  min,
  max,
}: {
  label: string;
  minutes: number;
  onChange: (m: number) => void;
  min: number;
  max: number;
}) {
  const step = (d: number) => onChange(Math.max(min, Math.min(max, minutes + d)));
  return (
    <View style={styles.rowBetween}>
      <Text style={styles.settingLabel}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable
          onPress={() => step(-TIME_STEP_MIN)}
          disabled={minutes <= min}
          style={[styles.stepBtn, minutes <= min && { opacity: 0.3 }]}
          accessibilityLabel={`${label} earlier`}
        >
          <Text style={styles.stepBtnText}>−</Text>
        </Pressable>
        <Text style={styles.stepValue}>{formatClock(minutes)}</Text>
        <Pressable
          onPress={() => step(TIME_STEP_MIN)}
          disabled={minutes >= max}
          style={[styles.stepBtn, minutes >= max && { opacity: 0.3 }]}
          accessibilityLabel={`${label} later`}
        >
          <Text style={styles.stepBtnText}>+</Text>
        </Pressable>
      </View>
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
  timerSmall: { fontSize: 40 },
  timerCaption: { fontFamily: F.medium, color: C.muted, fontSize: 13, marginTop: -6, textAlign: 'center' },

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

  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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

  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.cardBorder,
    backgroundColor: 'rgba(0,0,0,0.25)',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  voiceRowOn: { borderColor: C.cyan, backgroundColor: 'rgba(59,232,255,0.12)' },
  voiceEmoji: { fontSize: 24 },
  voiceName: { flex: 1, fontFamily: F.semibold, color: C.text, fontSize: 15 },
  voiceMeta: { fontFamily: F.medium, color: C.muted, fontSize: 12 },

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
  chipLocked: { opacity: 0.45 },
  chipText: { fontFamily: F.semibold, color: C.muted, fontSize: 14 },
  chipTextOn: { color: '#06202A' },
  days: { flexDirection: 'row', gap: 6 },
  day: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.cardBorder,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#3A3566',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { fontFamily: F.bold, color: C.text, fontSize: 22, lineHeight: 26 },
  stepValue: { fontFamily: F.bold, color: C.text, fontSize: 18, minWidth: 56, textAlign: 'center' },

  footnote: { fontFamily: F.regular, color: C.dim, fontSize: 12, textAlign: 'center' },
});
