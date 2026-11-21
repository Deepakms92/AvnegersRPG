import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

export const C = {
  bgTop: '#2A1060',
  bgBottom: '#0A0F2C',
  alertTop: '#7A0F2E',
  alertBottom: '#1A0420',
  card: 'rgba(255,255,255,0.07)',
  cardBorder: 'rgba(255,255,255,0.12)',
  text: '#FFFFFF',
  muted: '#B3AEDB',
  dim: '#6E6A99',
  lime: '#9BFF3B',
  limeEdge: '#4E9E0F',
  cyan: '#3BE8FF',
  gold: '#FFD23B',
  goldEdge: '#B8860B',
  orange: '#FF8A3B',
  red: '#FF3B5C',
  redEdge: '#A3122E',
  pink: '#FF3BC8',
  purple: '#8B5CFF',
  purpleEdge: '#4B2BA8',
};

export const F = {
  regular: 'Fredoka_400Regular',
  medium: 'Fredoka_500Medium',
  semibold: 'Fredoka_600SemiBold',
  bold: 'Fredoka_700Bold',
};

export function energyColor(energy: number) {
  if (energy > 0.6) return C.lime;
  if (energy > 0.35) return C.gold;
  if (energy > 0.15) return C.orange;
  return C.red;
}

/** A 3D "arcade" button: the face sinks into its edge when pressed. */
export function ChunkyButton({
  label,
  sublabel,
  face,
  edge,
  onPress,
  textColor = '#10210A',
  big = false,
  style,
}: {
  label: string;
  sublabel?: string;
  face: string;
  edge: string;
  onPress: () => void;
  textColor?: string;
  big?: boolean;
  style?: ViewStyle;
}) {
  const depth = big ? 8 : 5;
  return (
    <Pressable onPress={onPress} style={[{ paddingBottom: depth }, style]}>
      {({ pressed }) => (
        <View>
          <View style={[styles.btnEdge, { backgroundColor: edge, top: depth, bottom: -depth, borderRadius: big ? 22 : 16 }]} />
          <View
            style={[
              styles.btnFace,
              {
                backgroundColor: face,
                borderRadius: big ? 22 : 16,
                paddingVertical: big ? 20 : 12,
                transform: [{ translateY: pressed ? depth - 1 : 0 }],
              },
            ]}
          >
            <Text style={[styles.btnLabel, { color: textColor, fontSize: big ? 26 : 16 }]}>{label}</Text>
            {sublabel ? <Text style={[styles.btnSub, { color: textColor }]}>{sublabel}</Text> : null}
          </View>
        </View>
      )}
    </Pressable>
  );
}

/** Segmented progress bar, like a game health bar. */
export function SegmentBar({
  value,
  segments = 10,
  color,
  height = 18,
}: {
  value: number;
  segments?: number;
  color: string;
  height?: number;
}) {
  const filled = value * segments;
  return (
    <View style={[styles.barTrack, { height }]}>
      {Array.from({ length: segments }, (_, i) => {
        const fill = Math.max(0, Math.min(1, filled - i));
        return (
          <View key={i} style={styles.barSeg}>
            <View style={{ width: `${fill * 100}%`, height: '100%', backgroundColor: color, borderRadius: 3 }} />
          </View>
        );
      })}
    </View>
  );
}

/** Smooth thin progress bar (XP). */
export function ThinBar({ value, color }: { value: number; color: string }) {
  return (
    <View style={styles.thinTrack}>
      <View style={[styles.thinFill, { width: `${Math.max(0, Math.min(1, value)) * 100}%`, backgroundColor: color }]} />
    </View>
  );
}

/** Bobbing avatar ring; shakes when in alarm mode. */
export function Avatar({ children, alarm }: { children: React.ReactNode; alarm: boolean }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    anim.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: alarm ? 90 : 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: alarm ? 90 : 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [alarm, anim]);

  const transform = alarm
    ? [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [-6, 6] }) }]
    : [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) }];

  return (
    <View style={styles.avatarRing}>
      <Animated.View style={{ transform }}>{children}</Animated.View>
    </View>
  );
}

/** Gently pulses its children (used for the alarm state CTA). */
export function Pulse({ active, children }: { active: boolean; children: React.ReactNode }) {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active) {
      anim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1.05, duration: 450, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1, duration: 450, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, anim]);
  return <Animated.View style={{ transform: [{ scale: anim }] }}>{children}</Animated.View>;
}

export type Toast = { id: number; title: string; lines: string[]; color: string };

/** Floating reward pop-up that rises and fades out. */
export function RewardToast({ toast }: { toast: Toast | null }) {
  const anim = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState<Toast | null>(null);

  useEffect(() => {
    if (!toast) return;
    setShown(toast);
    anim.setValue(0);
    Animated.sequence([
      Animated.spring(anim, { toValue: 1, friction: 5, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(anim, { toValue: 2, duration: 400, useNativeDriver: true }),
    ]).start(() => setShown(null));
  }, [toast, anim]);

  if (!shown) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.toast,
        { borderColor: shown.color },
        {
          opacity: anim.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }),
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1, 2], outputRange: [30, 0, -40] }) },
            { scale: anim.interpolate({ inputRange: [0, 1, 2], outputRange: [0.6, 1, 1] }) },
          ],
        },
      ]}
    >
      <Text style={[styles.toastTitle, { color: shown.color }]}>{shown.title}</Text>
      {shown.lines.map((l) => (
        <Text key={l} style={styles.toastLine}>
          {l}
        </Text>
      ))}
    </Animated.View>
  );
}

/** A card with a tappable header that expands and collapses its content. */
export function Section({
  title,
  meta,
  children,
  initiallyOpen = false,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <Card>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={styles.sectionHead}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionMeta}>
          {meta ? `${meta}  ` : ''}
          {open ? '▲' : '▼'}
        </Text>
      </Pressable>
      {open && <View style={{ marginTop: 14 }}>{children}</View>}
    </Card>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  btnEdge: { position: 'absolute', left: 0, right: 0 },
  btnFace: { alignItems: 'center', justifyContent: 'center' },
  btnLabel: { fontFamily: F.bold, letterSpacing: 1 },
  btnSub: { fontFamily: F.semibold, fontSize: 13, opacity: 0.75, marginTop: 2 },
  barTrack: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  barSeg: { flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' },
  thinTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.4)', overflow: 'hidden' },
  thinFill: { height: '100%', borderRadius: 4 },
  avatarRing: {
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toast: {
    position: 'absolute',
    top: 110,
    alignSelf: 'center',
    backgroundColor: 'rgba(12,8,40,0.95)',
    borderWidth: 2,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    zIndex: 10,
    elevation: 10,
  },
  toastTitle: { fontFamily: F.bold, fontSize: 28 },
  toastLine: { fontFamily: F.medium, fontSize: 14, color: C.muted, marginTop: 2 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionTitle: { fontFamily: F.bold, color: C.text, fontSize: 17 },
  sectionMeta: { fontFamily: F.semibold, color: C.muted, fontSize: 14 },
  card: {
    backgroundColor: C.card,
    borderColor: C.cardBorder,
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
  },
});
