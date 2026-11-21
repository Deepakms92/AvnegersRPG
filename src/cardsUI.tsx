import { StyleSheet, Text, View } from 'react-native';

import { CARDS, ChallengeCard, RARITY } from './cards';
import { C, F } from './ui';

/** The challenge card dealt for this alert, shown big. */
export function ChallengeCardView({ card }: { card: ChallengeCard }) {
  const r = RARITY[card.rarity];
  return (
    <View style={[styles.card, { borderColor: r.color, shadowColor: r.color }]}>
      <View style={styles.cardTop}>
        <Text style={[styles.rarity, { color: r.color }]}>
          {r.icon} {r.label.toUpperCase()} CHALLENGE
        </Text>
        {r.xp > 0 && (
          <View style={[styles.xpChip, { backgroundColor: r.color }]}>
            <Text style={styles.xpChipText}>+{r.xp} XP</Text>
          </View>
        )}
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardEmoji}>{card.emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{card.title}</Text>
          <Text style={styles.cardText}>{card.text}</Text>
        </View>
      </View>
    </View>
  );
}

/** Teaser shown while energy is still draining. */
export function CardTeaser() {
  return (
    <View style={styles.teaser}>
      <Text style={styles.teaserText}>🎴 A challenge card is dealt when energy hits 0%</Text>
    </View>
  );
}

/** Grid of all cards: completed ones show their art and count, the rest stay hidden. */
export function CardCollection({ owned }: { owned: Record<string, number> }) {
  return (
    <View style={styles.grid}>
      {CARDS.map((c) => {
        const count = owned[c.id] ?? 0;
        const r = RARITY[c.rarity];
        return (
          <View
            key={c.id}
            style={[styles.tile, { borderColor: count ? r.color : 'rgba(255,255,255,0.08)' }]}
            accessibilityLabel={count ? `${c.title}, ${r.label}, completed ${count} times` : `Hidden ${r.label} card`}
          >
            <Text style={[styles.tileEmoji, !count && { opacity: 0.35 }]}>{count ? c.emoji : '❔'}</Text>
            <Text style={[styles.tileName, !count && { color: C.dim }]} numberOfLines={1}>
              {count ? c.title : '???'}
            </Text>
            <Text style={[styles.tileMeta, { color: r.color }]}>
              {r.icon}
              {count > 1 ? ` ×${count}` : ''}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    borderWidth: 2,
    borderRadius: 18,
    padding: 14,
    backgroundColor: 'rgba(10,8,40,0.7)',
    shadowOpacity: 0.6,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
    gap: 10,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rarity: { fontFamily: F.bold, fontSize: 12, letterSpacing: 1.2 },
  xpChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
  xpChipText: { fontFamily: F.bold, fontSize: 12, color: '#10102A' },
  cardBody: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardEmoji: { fontSize: 40 },
  cardTitle: { fontFamily: F.bold, color: C.text, fontSize: 20 },
  cardText: { fontFamily: F.medium, color: C.muted, fontSize: 14, marginTop: 2 },
  teaser: {
    alignSelf: 'stretch',
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.25)',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  teaserText: { fontFamily: F.medium, color: C.muted, fontSize: 13, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    width: '18%',
    flexGrow: 1,
    minWidth: 58,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 12,
    borderWidth: 1.5,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  tileEmoji: { fontSize: 24 },
  tileName: { fontFamily: F.semibold, color: C.text, fontSize: 10, marginTop: 2 },
  tileMeta: { fontFamily: F.bold, fontSize: 10, marginTop: 1 },
});
