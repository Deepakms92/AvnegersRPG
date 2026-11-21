import { useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { DAILY_GOAL, dayKeyOf, DayLog, EMPTY_DAY, GameStats, levelInfo } from './game';
import { C, ChunkyButton, F } from './ui';

const WINDOW_DAYS = 14;
const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type Day = DayLog & { key: string; date: Date };

/** Numbers for the last 14 days (or since you started, if that's shorter). */
export function summarize(stats: GameStats, now = Date.now()) {
  const days: Day[] = [];
  for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - i);
    const key = dayKeyOf(date.getTime());
    days.push({ ...EMPTY_DAY, ...stats.history[key], key, date });
  }
  let sinceStart = WINDOW_DAYS;
  if (stats.firstDay) {
    const [y, m, d] = stats.firstDay.split('-').map(Number);
    const first = new Date(y, m - 1, d, 12).getTime();
    sinceStart = Math.min(WINDOW_DAYS, Math.floor((days[days.length - 1].date.getTime() - first) / 864e5) + 1);
  }
  const sum = (f: (d: Day) => number) => days.reduce((a, d) => a + f(d), 0);
  const activeDays = days.filter((d) => d.moves > 0).length;
  const moves = sum((d) => d.moves);
  const answered = sum((d) => d.answered);
  return {
    days,
    sinceStart: Math.max(1, sinceStart),
    activeDays,
    moves,
    avgMoves: activeDays ? moves / activeDays : 0,
    goalDays: days.filter((d) => d.moves >= DAILY_GOAL).length,
    answered,
    quickPct: answered ? sum((d) => d.quick) / answered : null,
    avgResponseMin: answered ? sum((d) => d.responseMinSum) / answered : null,
    snoozes: sum((d) => d.snoozes),
    cards: sum((d) => d.cards),
    longestSit: Math.max(0, ...days.map((d) => d.maxSitMin)),
  };
}

function fmtDate(d: Date) {
  return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function fmtMin(m: number | null) {
  if (m === null) return '–';
  return m < 1 ? '<1 min' : `${Math.round(m)} min`;
}

/** A plain-text report testers can send you. */
export function reportText(stats: GameStats, now = Date.now()) {
  const s = summarize(stats, now);
  const lvl = levelInfo(stats.xp);
  return [
    `📊 My WellPing report (last ${s.sinceStart} day${s.sinceStart === 1 ? '' : 's'})`,
    `• Active on ${s.activeDays} of ${s.sinceStart} days`,
    `• ${s.moves} moves, ${s.avgMoves.toFixed(1)} per active day`,
    `• Daily goal hit on ${s.goalDays} days, streak ${stats.streak} 🔥`,
    `• Answered ${s.answered} alerts, ${s.quickPct === null ? '–' : Math.round(s.quickPct * 100) + '%'} within 5 min (avg ${fmtMin(s.avgResponseMin)})`,
    `• Snoozed ${s.snoozes} times, longest sit ${s.longestSit} min`,
    `• Level ${lvl.level} ${lvl.title}, ${Object.keys(stats.cards).length} cards collected`,
    `Moves per day: ${s.days.map((d) => d.moves).join(' ')}`,
  ].join('\n');
}

export function StatsPanel({ stats }: { stats: GameStats }) {
  const s = summarize(stats);
  const [selected, setSelected] = useState(s.days.length - 1);
  const sel = s.days[Math.min(selected, s.days.length - 1)];
  const max = Math.max(DAILY_GOAL, ...s.days.map((d) => d.moves));
  const CHART_H = 120;

  return (
    <View style={{ gap: 14 }}>
      <View style={styles.tiles}>
        <Tile value={`${s.activeDays}/${s.sinceStart}`} label="days active" />
        <Tile value={s.avgMoves.toFixed(1)} label="moves / active day" />
        <Tile value={s.quickPct === null ? '–' : `${Math.round(s.quickPct * 100)}%`} label="alerts answered in 5 min" />
        <Tile value={fmtMin(s.avgResponseMin)} label="avg response time" />
      </View>

      <View>
        <Text style={styles.chartTitle}>Moves per day · last {WINDOW_DAYS} days</Text>
        <Text style={styles.readout}>
          {fmtDate(sel.date)}: <Text style={styles.readoutValue}>{sel.moves} moves</Text>
          {sel.moves >= DAILY_GOAL ? ' · goal ✓' : ''}
          {sel.snoozes ? ` · ${sel.snoozes} snoozes` : ''}
          {sel.maxSitMin ? ` · longest sit ${sel.maxSitMin} min` : ''}
        </Text>
        <View style={[styles.plot, { height: CHART_H }]}>
          {/* Daily goal reference line */}
          <View style={[styles.goalLine, { bottom: (DAILY_GOAL / max) * CHART_H }]} />
          <Text style={[styles.goalLabel, { bottom: (DAILY_GOAL / max) * CHART_H + 2 }]}>goal {DAILY_GOAL}</Text>
          {s.days.map((d, i) => {
            const h = d.moves ? Math.max(4, (d.moves / max) * CHART_H) : 0;
            const on = i === selected;
            return (
              <Pressable
                key={d.key}
                onPress={() => setSelected(i)}
                style={styles.col}
                accessibilityLabel={`${fmtDate(d.date)}: ${d.moves} moves`}
              >
                {on && d.moves > 0 && <Text style={styles.barValue}>{d.moves}</Text>}
                <View
                  style={[
                    styles.bar,
                    { height: h, backgroundColor: C.lime, opacity: on ? 1 : 0.7 },
                    on && styles.barOn,
                  ]}
                />
              </Pressable>
            );
          })}
        </View>
        <View style={styles.axis}>
          {s.days.map((d, i) => (
            <Text key={d.key} style={[styles.axisLabel, i === selected && { color: C.text }]}>
              {WEEKDAY[d.date.getDay()]}
            </Text>
          ))}
        </View>
      </View>

      <Text style={styles.note}>
        {s.snoozes} snoozes · longest sit {s.longestSit} min · {s.cards} cards completed. All of this stays on your
        phone.
      </Text>

      <ChunkyButton
        label="📤 Share my report"
        face="#3A3566"
        edge="#1F1B44"
        textColor="#FFFFFF"
        onPress={() => Share.share({ message: reportText(stats) }).catch(() => {})}
      />
    </View>
  );
}

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  tileValue: { fontFamily: F.bold, color: C.text, fontSize: 22 },
  tileLabel: { fontFamily: F.medium, color: C.muted, fontSize: 12 },
  chartTitle: { fontFamily: F.semibold, color: C.text, fontSize: 14 },
  readout: { fontFamily: F.regular, color: C.muted, fontSize: 12, marginTop: 2, marginBottom: 18 },
  readoutValue: { fontFamily: F.bold, color: C.text },
  plot: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.2)' },
  goalLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.35)',
  },
  goalLabel: { position: 'absolute', right: 0, fontFamily: F.medium, color: C.dim, fontSize: 10 },
  col: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  bar: { width: '70%', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  barOn: { width: '84%' },
  barValue: { fontFamily: F.bold, color: C.text, fontSize: 11, marginBottom: 2 },
  axis: { flexDirection: 'row', gap: 2, marginTop: 4 },
  axisLabel: { flex: 1, textAlign: 'center', fontFamily: F.medium, color: C.dim, fontSize: 10 },
  note: { fontFamily: F.regular, color: C.muted, fontSize: 12 },
});
