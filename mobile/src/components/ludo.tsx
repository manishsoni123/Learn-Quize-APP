/**
 * The Ludo board.
 *
 * Split by what each tool is actually good at: the board is static geometry
 * with awkward shapes — a cross, four quadrants, a pinwheel of triangles in
 * the middle — which is SVG's job. The tokens move, and moving things are
 * cheaper and smoother as absolutely-positioned Animated.Views on top than as
 * SVG attributes being re-rendered.
 *
 * Everything is laid out in cell units (0–15) from src/lib/ludoBoard and
 * multiplied by one `cell` value, so the board is resolution-independent and
 * there is exactly one number to change to resize it.
 */

import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Polygon, Rect } from 'react-native-svg';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import {
  GRID,
  HOME_PATH,
  PATH,
  SAFE,
  SEAT_COLOR,
  SEAT_DIM,
  START,
  YARD_ORIGIN,
  type LudoPlayer,
  type Seat,
  tokenCell,
} from '../lib/ludoBoard';
import { arcade, radius, space } from '../theme/arcade';
import { duration } from '../theme';

/* ------------------------------------------------------------------ board */

export function LudoBoard({ size }: { size: number }) {
  const cell = size / GRID;

  return (
    <Svg width={size} height={size}>
      <Rect x={0} y={0} width={size} height={size} fill={arcade.surface} rx={10} />

      {/* --------------------------------------------------------- yards */}
      {YARD_ORIGIN.map(([ox, oy], seat) => (
        <G key={`yard-${seat}`}>
          <Rect
            x={ox * cell}
            y={oy * cell}
            width={cell * 6}
            height={cell * 6}
            fill={SEAT_COLOR[seat]}
            rx={8}
          />
          <Rect
            x={(ox + 1) * cell}
            y={(oy + 1) * cell}
            width={cell * 4}
            height={cell * 4}
            fill={arcade.surface}
            rx={6}
          />
        </G>
      ))}

      {/* --------------------------------------------------------- track */}
      {PATH.map(([x, y], abs) => {
        // A start square is painted in its owner's colour — it is where that
        // seat's tokens appear, and it doubles as one of the safe squares.
        const owner = START.indexOf(abs as (typeof START)[number]);
        const safe = SAFE.includes(abs as (typeof SAFE)[number]);

        return (
          <G key={`t-${abs}`}>
            <Rect
              x={x * cell}
              y={y * cell}
              width={cell}
              height={cell}
              fill={owner >= 0 ? SEAT_COLOR[owner] : arcade.surfaceAlt}
              stroke={arcade.line}
              strokeWidth={0.6}
            />
            {safe && owner < 0 ? (
              <Star cx={(x + 0.5) * cell} cy={(y + 0.5) * cell} r={cell * 0.3} />
            ) : null}
          </G>
        );
      })}

      {/* -------------------------------------------------- home columns */}
      {HOME_PATH.map((column, seat) =>
        column.map(([x, y], i) => (
          <Rect
            key={`h-${seat}-${i}`}
            x={x * cell}
            y={y * cell}
            width={cell}
            height={cell}
            fill={SEAT_COLOR[seat]}
            opacity={0.55}
            stroke={arcade.line}
            strokeWidth={0.6}
          />
        )),
      )}

      {/* ---------------------------------------------------- the centre */}
      {/* Four triangles meeting in the middle, each pointing back down its
          owner's home column so it reads as that seat's destination. */}
      <Polygon
        points={tri(6, 6, 6, 9, cell)}
        fill={SEAT_COLOR[0]}
      />
      <Polygon points={tri(6, 6, 9, 6, cell)} fill={SEAT_COLOR[1]} />
      <Polygon points={tri(9, 6, 9, 9, cell)} fill={SEAT_COLOR[2]} />
      <Polygon points={tri(6, 9, 9, 9, cell)} fill={SEAT_COLOR[3]} />
      <Circle
        cx={7.5 * cell}
        cy={7.5 * cell}
        r={cell * 0.34}
        fill={arcade.surface}
        stroke={arcade.line}
      />
    </Svg>
  );
}

/** Triangle from an edge of the centre block to its middle. */
function tri(x1: number, y1: number, x2: number, y2: number, cell: number): string {
  return [
    `${x1 * cell},${y1 * cell}`,
    `${x2 * cell},${y2 * cell}`,
    `${7.5 * cell},${7.5 * cell}`,
  ].join(' ');
}

function Star({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const points: string[] = [];
  for (let i = 0; i < 10; i++) {
    const angle = (-90 + i * 36) * (Math.PI / 180);
    const radius = i % 2 === 0 ? r : r * 0.42;
    points.push(`${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`);
  }
  return <Polygon points={points.join(' ')} fill={arcade.inkFaint} opacity={0.5} />;
}

/* ----------------------------------------------------------------- token */

export function LudoToken({
  seat,
  index,
  pos,
  cell,
  selectable = false,
  onPress,
}: {
  seat: Seat;
  index: number;
  pos: number;
  cell: number;
  selectable?: boolean;
  onPress?: () => void;
}) {
  const target = tokenCell(seat, pos, index);
  const size = cell * 0.66;

  const x = useSharedValue(target.x * cell);
  const y = useSharedValue(target.y * cell);
  const ring = useSharedValue(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    const ms = reduced ? 0 : duration.base;
    x.value = withTiming(target.x * cell, { duration: ms });
    y.value = withTiming(target.y * cell, { duration: ms });
  }, [target.x, target.y, cell, reduced, x, y]);

  useEffect(() => {
    if (selectable && !reduced) {
      ring.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 520 }),
          withTiming(0, { duration: 520 }),
        ),
        -1,
      );
    } else {
      ring.value = withTiming(selectable ? 1 : 0, { duration: duration.fast });
    }
  }, [selectable, reduced, ring]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value - size / 2 },
      { translateY: y.value - size / 2 },
    ],
  }));

  const halo = useAnimatedStyle(() => ({
    opacity: 0.35 + ring.value * 0.65,
    transform: [{ scale: 1 + ring.value * 0.22 }],
  }));

  return (
    <Animated.View style={[styles.token, { width: size, height: size }, style]}>
      {selectable ? (
        <Animated.View
          style={[
            styles.halo,
            { width: size, height: size, borderRadius: size / 2 },
            halo,
          ]}
        />
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Token ${index + 1}`}
        accessibilityState={{ disabled: !selectable }}
        disabled={!selectable}
        onPress={onPress}
        // Tokens are smaller than a comfortable tap target at this board size,
        // so the hit area is deliberately larger than the circle.
        hitSlop={10}
        style={[
          styles.tokenBody,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: SEAT_COLOR[seat],
            borderColor: selectable ? arcade.ink : SEAT_DIM[seat],
          },
        ]}
      >
        <View
          style={[
            styles.tokenPip,
            { width: size * 0.3, height: size * 0.3, borderRadius: size },
          ]}
        />
      </Pressable>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------- die */

const PIPS: Record<number, ReadonlyArray<readonly [number, number]>> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};

export function Die({ value, rolling }: { value: number | null; rolling?: boolean }) {
  const spin = useSharedValue(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (rolling && !reduced) {
      spin.value = withRepeat(withTiming(1, { duration: 260 }), -1);
    } else {
      spin.value = withTiming(0, { duration: duration.fast });
    }
  }, [rolling, reduced, spin]);

  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 90}deg` }, { scale: 1 + spin.value * 0.08 }],
  }));

  const pips = value ? PIPS[value] : [];

  return (
    <Animated.View style={[styles.die, style]}>
      <View style={styles.dieFace}>
        {[0, 1, 2].map((r) =>
          [0, 1, 2].map((c) => {
            const on = pips.some(([pc, pr]) => pc === c && pr === r);
            return (
              <View key={`${r}-${c}`} style={styles.pipSlot}>
                {on ? <View style={styles.pip} /> : null}
              </View>
            );
          }),
        )}
      </View>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ seats */

export function SeatBar({
  players,
  turn,
  winner,
}: {
  players: LudoPlayer[];
  turn: number;
  winner: number | null;
}) {
  return (
    <View style={styles.seats}>
      {players.map((p) => {
        const home = p.tokens.filter((t) => t === 57).length;
        const active = p.seat === turn && winner === null;

        return (
          <View
            key={p.seat}
            style={[
              styles.seat,
              { borderColor: active ? SEAT_COLOR[p.seat] : 'transparent' },
            ]}
          >
            <View style={[styles.seatDot, { backgroundColor: SEAT_COLOR[p.seat] }]} />
            <Text style={[styles.seatName, active && { color: arcade.ink }]} numberOfLines={1}>
              {p.kind === 'human' ? 'You' : (p.name ?? 'Bot')}
            </Text>
            <Text style={styles.seatHome}>{home}/4</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  token: { position: 'absolute', left: 0, top: 0, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', backgroundColor: arcade.ink, opacity: 0.4 },
  tokenBody: {
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenPip: { backgroundColor: '#FFFFFF', opacity: 0.85 },

  die: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: arcade.ink,
    padding: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dieFace: {
    flex: 1,
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  pipSlot: { width: '33.33%', height: '33.33%', padding: 2 },
  pip: { flex: 1, borderRadius: 99, backgroundColor: arcade.bg },

  seats: { flexDirection: 'row', gap: space.xs },
  seat: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    backgroundColor: arcade.surface,
  },
  seatDot: { width: 7, height: 7, borderRadius: 4 },
  seatName: { flex: 1, color: arcade.inkFaint, fontSize: 11, fontWeight: '700' },
  seatHome: {
    color: arcade.inkSoft,
    fontSize: 11,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
});
