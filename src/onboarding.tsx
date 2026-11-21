import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, Vibration, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { Buddy } from './buddy';
import { say } from './reminder';
import { C, ChunkyButton, F } from './ui';
import { VOICES } from './voices';

export type OnboardingChoices = {
  intervalMin: number;
  workHours: boolean;
  alertStyle: 'loud' | 'discreet';
  /** False if the user chose "Not now" on the last step. */
  enable: boolean;
};

const INTERVALS = [15, 30, 45, 60, 90];
const STEPS = 4;

/** First-run setup: meet Pip, pick a rhythm and alert style, then grant permissions. */
export function Onboarding({ onDone }: { onDone: (c: OnboardingChoices) => void }) {
  const [step, setStep] = useState(0);
  const [intervalMin, setIntervalMin] = useState(45);
  const [workHours, setWorkHours] = useState(true);
  const [alertStyle, setAlertStyle] = useState<'loud' | 'discreet'>('loud');
  const next = () => setStep((s) => Math.min(STEPS - 1, s + 1));

  const preview = (style: 'loud' | 'discreet') => {
    setAlertStyle(style);
    if (style === 'loud') say("Hey! You've been sitting for 45 minutes. Time to move!", VOICES[0]);
    else Vibration.vibrate([0, 400, 250, 400]);
  };

  return (
    <LinearGradient colors={[C.bgTop, C.bgBottom]} style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topRow}>
          {step > 0 ? (
            <Pressable onPress={() => setStep(step - 1)} accessibilityRole="button" hitSlop={12}>
              <Text style={styles.back}>‹ Back</Text>
            </Pressable>
          ) : (
            <View />
          )}
          <View style={styles.dots} accessibilityLabel={`Step ${step + 1} of ${STEPS}`}>
            {Array.from({ length: STEPS }, (_, i) => (
              <View key={i} style={[styles.dot, i === step && styles.dotOn]} />
            ))}
          </View>
        </View>

        <View style={styles.buddy}>
          <Buddy level={1} mood={step === 2 && alertStyle === 'discreet' ? 'ok' : 'happy'} hatId="none" size={150} />
        </View>

        {step === 0 && (
          <>
            <Text style={styles.title}>Hi, I'm Pip! 👋</Text>
            <Text style={styles.body}>
              I get stiff when you sit too long, and if you sit way too long I turn into a zombie 🧟.
            </Text>
            <Text style={styles.body}>
              I'll remind you to get up, deal you quick challenge cards, and level up with you every time you move.
            </Text>
            <Spacer />
            <ChunkyButton big label="NICE TO MEET YOU!" face={C.lime} edge={C.limeEdge} onPress={next} />
          </>
        )}

        {step === 1 && (
          <>
            <Text style={styles.title}>When should I ping you?</Text>
            <Text style={styles.label}>Remind me after sitting for</Text>
            <View style={styles.chips}>
              {INTERVALS.map((m) => (
                <Pressable
                  key={m}
                  onPress={() => setIntervalMin(m)}
                  style={[styles.chip, intervalMin === m && styles.chipOn]}
                  accessibilityState={{ selected: intervalMin === m }}
                >
                  <Text style={[styles.chipText, intervalMin === m && styles.chipTextOn]}>{m} min</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.hint}>45 minutes is a good start for most people.</Text>
            <Text style={[styles.label, { marginTop: 18 }]}>Remind me</Text>
            <Option
              selected={workHours}
              onPress={() => setWorkHours(true)}
              title="💼 On work days only"
              text="Mon–Fri, 09:00–18:00. Weekends off, and they won't break your streak."
            />
            <Option
              selected={!workHours}
              onPress={() => setWorkHours(false)}
              title="🗓️ Every day, any time"
              text="Reminders whenever reminders are on."
            />
            <Text style={styles.hint}>You can change days and hours later in Settings.</Text>
            <Spacer />
            <ChunkyButton big label="NEXT" face={C.lime} edge={C.limeEdge} onPress={next} />
          </>
        )}

        {step === 2 && (
          <>
            <Text style={styles.title}>How should I nag you?</Text>
            <Option
              selected={alertStyle === 'loud'}
              onPress={() => preview('loud')}
              title="🔊 Out loud"
              text="I say it out loud. Hard to ignore! Tap to hear me."
            />
            <Option
              selected={alertStyle === 'discreet'}
              onPress={() => preview('discreet')}
              title="🤫 Discreet"
              text="Vibration only. Great for open offices, or with a smartwatch. Tap to feel it."
            />
            <Text style={styles.hint}>
              In a meeting? Tap 🤝 in the app or on a reminder to pause me. You can unlock more voices (Drill Sergeant,
              Grandma, Pirate…) as you level up.
            </Text>
            <Spacer />
            <ChunkyButton big label="NEXT" face={C.lime} edge={C.limeEdge} onPress={next} />
          </>
        )}

        {step === 3 && (
          <>
            <Text style={styles.title}>Two quick permissions</Text>
            <View style={styles.perm}>
              <Text style={styles.permIcon}>🔔</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.permTitle}>Notifications</Text>
                <Text style={styles.permText}>So reminders reach you even when WellPing is closed.</Text>
              </View>
            </View>
            <View style={styles.perm}>
              <Text style={styles.permIcon}>🚶</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.permTitle}>Physical activity (optional)</Text>
                <Text style={styles.permText}>
                  So walking around resets your timer automatically. Step data never leaves your phone.
                </Text>
              </View>
            </View>
            <Spacer />
            <ChunkyButton
              big
              label="LET'S GO!"
              sublabel="Allow and start"
              face={C.lime}
              edge={C.limeEdge}
              onPress={() => onDone({ intervalMin, workHours, alertStyle, enable: true })}
            />
            <Pressable
              onPress={() => onDone({ intervalMin, workHours, alertStyle, enable: false })}
              style={styles.notNow}
              accessibilityRole="button"
            >
              <Text style={styles.notNowText}>Not now, just look around</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

function Option({
  selected,
  onPress,
  title,
  text,
}: {
  selected: boolean;
  onPress: () => void;
  title: string;
  text: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.option, selected && styles.optionOn]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <Text style={styles.optionTitle}>
        {title} {selected ? '✓' : ''}
      </Text>
      <Text style={styles.optionText}>{text}</Text>
    </Pressable>
  );
}

const Spacer = () => <View style={{ height: 12 }} />;

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, paddingTop: 56, paddingBottom: 40, gap: 12, flexGrow: 1 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 24 },
  back: { fontFamily: F.semibold, color: C.muted, fontSize: 16 },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.2)' },
  dotOn: { width: 22, backgroundColor: C.lime },
  buddy: { alignItems: 'center', marginVertical: 4 },
  title: { fontFamily: F.bold, color: C.text, fontSize: 28, textAlign: 'center' },
  body: { fontFamily: F.medium, color: C.muted, fontSize: 16, textAlign: 'center', lineHeight: 23 },
  label: { fontFamily: F.semibold, color: C.text, fontSize: 15 },
  hint: { fontFamily: F.regular, color: C.muted, fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.cardBorder,
    backgroundColor: 'rgba(0,0,0,0.25)',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  chipOn: { backgroundColor: C.cyan, borderColor: C.cyan },
  chipText: { fontFamily: F.semibold, color: C.muted, fontSize: 15 },
  chipTextOn: { color: '#06202A' },
  option: {
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: C.cardBorder,
    backgroundColor: C.card,
    padding: 14,
    gap: 4,
  },
  optionOn: { borderColor: C.cyan, backgroundColor: 'rgba(59,232,255,0.12)' },
  optionTitle: { fontFamily: F.bold, color: C.text, fontSize: 17 },
  optionText: { fontFamily: F.regular, color: C.muted, fontSize: 14 },
  perm: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    backgroundColor: C.card,
    borderColor: C.cardBorder,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  permIcon: { fontSize: 28 },
  permTitle: { fontFamily: F.bold, color: C.text, fontSize: 16 },
  permText: { fontFamily: F.regular, color: C.muted, fontSize: 14 },
  notNow: { alignItems: 'center', paddingVertical: 10 },
  notNowText: { fontFamily: F.semibold, color: C.muted, fontSize: 14, textDecorationLine: 'underline' },
});
