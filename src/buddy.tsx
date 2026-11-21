import Svg, { Circle, Ellipse, G, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';

import { BuddyMood, stageFor } from './buddyData';

/**
 * Pip, your buddy. Pip evolves as you level up, shows how you're doing through
 * its mood, and can wear hats you unlock.
 */

const INK = '#1A0B3A';

export function Buddy({
  level,
  mood,
  hatId,
  size = 120,
}: {
  level: number;
  mood: BuddyMood;
  hatId: string;
  size?: number;
}) {
  const st = stageFor(level);
  const zombie = mood === 'zombie';
  const body = zombie ? '#8FB08A' : st.body;
  const shade = zombie ? '#5E7A5A' : st.shade;
  const { rx, ry, cy } = st;
  const top = cy - ry;
  const eyeY = cy - 10;
  const sleeping = mood === 'sleep';

  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      {/* Shadow */}
      <Ellipse cx={100} cy={190} rx={rx * 0.75} ry={6} fill="#000" opacity={0.3} />

      {/* Legend sparkles */}
      {st.index === 3 && !zombie && (
        <G fill="#FFF6C2">
          <Polygon points="28,60 32,70 42,74 32,78 28,88 24,78 14,74 24,70" />
          <Polygon points="170,46 173,53 180,56 173,59 170,66 167,59 160,56 167,53" />
          <Polygon points="176,120 178,125 183,127 178,129 176,134 174,129 169,127 174,125" />
        </G>
      )}

      {/* Arms (from stage 2) */}
      {st.index >= 1 && (
        <G stroke={shade} strokeWidth={13} strokeLinecap="round" fill="none">
          {zombie ? (
            <>
              <Path d={`M${100 - rx + 6} ${cy - 4} L${100 - rx - 26} ${cy - 10}`} />
              <Path d={`M${100 + rx - 6} ${cy - 4} L${100 + rx + 26} ${cy - 10}`} />
            </>
          ) : mood === 'happy' ? (
            <>
              <Path d={`M${100 - rx + 6} ${cy} L${100 - rx - 16} ${cy - 30}`} />
              <Path d={`M${100 + rx - 6} ${cy} L${100 + rx + 16} ${cy - 30}`} />
            </>
          ) : (
            <>
              <Path d={`M${100 - rx + 6} ${cy + 4} L${100 - rx - 10} ${cy + 28}`} />
              <Path d={`M${100 + rx - 6} ${cy + 4} L${100 + rx + 10} ${cy + 28}`} />
            </>
          )}
        </G>
      )}

      {/* Feet: sneakers from stage 3 */}
      {[-1, 1].map((side) => (
        <G key={side}>
          <Ellipse cx={100 + side * rx * 0.45} cy={cy + ry - 2} rx={18} ry={10} fill={st.index >= 2 ? '#FFFFFF' : shade} />
          {st.index >= 2 && <Rect x={100 + side * rx * 0.45 - 12} y={cy + ry - 4} width={24} height={4} fill={shade} />}
        </G>
      ))}

      {/* Body */}
      <Ellipse cx={100} cy={cy} rx={rx} ry={ry} fill={body} />
      <Ellipse cx={100} cy={cy + ry * 0.35} rx={rx * 0.55} ry={ry * 0.45} fill="#FFFFFF" opacity={0.22} />
      <Ellipse cx={100 - rx * 0.45} cy={cy - ry * 0.45} rx={10} ry={6} fill="#FFFFFF" opacity={0.35} />

      {/* Sprout leaf (stage 1, no hat) */}
      {st.index === 0 && hatId === 'none' && (
        <G>
          <Path d={`M100 ${top + 2} Q98 ${top - 10} 104 ${top - 18}`} stroke={shade} strokeWidth={5} fill="none" strokeLinecap="round" />
          <Path d={`M104 ${top - 18} Q120 ${top - 30} 128 ${top - 16} Q114 ${top - 8} 104 ${top - 18} Z`} fill={st.body} stroke={shade} strokeWidth={3} />
        </G>
      )}

      {/* Eyes */}
      {[-1, 1].map((side) => {
        const x = 100 + side * 21;
        if (sleeping) {
          return <Path key={side} d={`M${x - 10} ${eyeY} Q${x} ${eyeY + 9} ${x + 10} ${eyeY}`} stroke={INK} strokeWidth={4.5} fill="none" strokeLinecap="round" />;
        }
        if (mood === 'tired') {
          return (
            <G key={side}>
              <Path d={`M${x - 12} ${eyeY} A12 12 0 0 0 ${x + 12} ${eyeY} Z`} fill="#FFFFFF" />
              <Circle cx={x} cy={eyeY + 5} r={5} fill={INK} />
              <Path d={`M${x - 13} ${eyeY} L${x + 13} ${eyeY}`} stroke={shade} strokeWidth={4} strokeLinecap="round" />
            </G>
          );
        }
        if (zombie) {
          return (
            <G key={side}>
              <Ellipse cx={x} cy={eyeY + 12} rx={12} ry={5} fill={shade} opacity={0.8} />
              <Circle cx={x} cy={eyeY} r={12} fill="#F4F7E8" />
              <Circle cx={x + side * 4} cy={eyeY + (side === 1 ? 4 : -3)} r={3} fill={INK} />
            </G>
          );
        }
        return (
          <G key={side}>
            <Circle cx={x} cy={eyeY} r={12} fill="#FFFFFF" />
            <Circle cx={x} cy={eyeY - (mood === 'happy' ? 2 : 0)} r={6.5} fill={INK} />
            <Circle cx={x + 2.5} cy={eyeY - 4.5} r={2.2} fill="#FFFFFF" />
          </G>
        );
      })}

      {/* Blush */}
      {(mood === 'happy' || mood === 'ok') &&
        [-1, 1].map((side) => <Ellipse key={side} cx={100 + side * 38} cy={cy + 8} rx={8} ry={5} fill="#FF6FA8" opacity={0.55} />)}

      {/* Mouth */}
      {mood === 'happy' && <Path d={`M84 ${cy + 10} Q100 ${cy + 32} 116 ${cy + 10} Z`} fill="#5A1036" />}
      {mood === 'ok' && <Path d={`M88 ${cy + 12} Q100 ${cy + 22} 112 ${cy + 12}`} stroke={INK} strokeWidth={4.5} fill="none" strokeLinecap="round" />}
      {mood === 'tired' && <Path d={`M90 ${cy + 16} L110 ${cy + 16}`} stroke={INK} strokeWidth={4.5} strokeLinecap="round" />}
      {zombie && (
        <Path d={`M84 ${cy + 18} q8 -8 16 0 t16 0`} stroke={INK} strokeWidth={4.5} fill="none" strokeLinecap="round" />
      )}
      {sleeping && <Circle cx={100} cy={cy + 16} r={5} fill={INK} />}
      {zombie && <Path d={`M${100 + rx - 14} ${top + 22} q-6 10 0 14 q6 -4 0 -14`} fill="#7FD8FF" />}
      {sleeping && (
        <G>
          <SvgText x={150} y={top + 4} fill="#FFFFFF" fontSize={22} fontWeight="bold">
            z
          </SvgText>
          <SvgText x={166} y={top - 14} fill="#FFFFFF" fontSize={16} fontWeight="bold" opacity={0.7}>
            z
          </SvgText>
        </G>
      )}

      <HatArt hatId={hatId} top={top} />
    </Svg>
  );
}

function HatArt({ hatId, top }: { hatId: string; top: number }) {
  switch (hatId) {
    case 'cap':
      return (
        <G>
          <Path d={`M62 ${top + 20} Q64 ${top - 22} 100 ${top - 24} Q136 ${top - 22} 138 ${top + 20} Z`} fill="#FF3B5C" />
          <Path d={`M120 ${top + 14} Q158 ${top + 8} 168 ${top + 20} Q150 ${top + 26} 120 ${top + 22} Z`} fill="#C81E3E" />
          <Circle cx={100} cy={top - 22} r={5} fill="#C81E3E" />
        </G>
      );
    case 'sweatband':
      return (
        <G>
          <Rect x={46} y={top + 18} width={108} height={14} rx={7} fill="#FFFFFF" />
          <Rect x={46} y={top + 23} width={108} height={4} fill="#FF3B5C" />
        </G>
      );
    case 'party':
      return (
        <G>
          <Polygon points={`100,${top - 52} 76,${top + 12} 124,${top + 12}`} fill="#FF3BC8" />
          <Path d={`M90 ${top - 22} L112 ${top - 14} M84 ${top - 4} L118 ${top + 6}`} stroke="#FFD23B" strokeWidth={5} />
          <Circle cx={100} cy={top - 54} r={8} fill="#FFD23B" />
        </G>
      );
    case 'beanie':
      return (
        <G>
          <Path d={`M58 ${top + 18} Q60 ${top - 30} 100 ${top - 32} Q140 ${top - 30} 142 ${top + 18} Z`} fill="#FF8A3B" />
          <Rect x={54} y={top + 6} width={92} height={16} rx={8} fill="#E0661A" />
          <Circle cx={100} cy={top - 34} r={11} fill="#FFFFFF" />
        </G>
      );
    case 'crown':
      return (
        <G>
          <Polygon
            points={`68,${top + 10} 68,${top - 24} 84,${top - 8} 100,${top - 32} 116,${top - 8} 132,${top - 24} 132,${top + 10}`}
            fill="#FFD23B"
            stroke="#B8860B"
            strokeWidth={3}
          />
          <Circle cx={100} cy={top - 4} r={5} fill="#FF3B5C" />
          <Circle cx={80} cy={top} r={4} fill="#3BE8FF" />
          <Circle cx={120} cy={top} r={4} fill="#3BE8FF" />
        </G>
      );
    default:
      return null;
  }
}
