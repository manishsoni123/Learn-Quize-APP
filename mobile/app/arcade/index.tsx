/**
 * The Arcade door.
 *
 * A category has to be chosen before a mode, not after. Mixing JavaScript and
 * candlestick patterns into one Survival run makes a score meaningless — you
 * cannot tell whether you did well or just drew a friendly deck. Scoping the
 * run is what makes the leaderboard mean something.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useGameModes, useMyRecords, useStartRun } from '../../src/api/arcade';
import { useCatalog } from '../../src/api/catalog';
import { useProfile } from '../../src/api/me';
import { ArcadeScreen, ModeCard } from '../../src/components/arcade';
import { useAuth } from '../../src/lib/auth';
import { arcade, radius, space } from '../../src/theme/arcade';

export default function ArcadeHome() {
  const router = useRouter();
  const { userId } = useAuth();

  const modes = useGameModes();
  const catalog = useCatalog();
  const profile = useProfile(userId);
  const records = useMyRecords(userId);
  const startRun = useStartRun();

  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const categories = useMemo(
    () => (catalog.data ?? []).flatMap((track) => track.categories),
    [catalog.data],
  );

  const level = profile.data?.level ?? 1;

  async function play(slug: string) {
    setError(null);
    try {
      const sessionId = await startRun.mutateAsync({ modeSlug: slug, categoryId });
      router.push({
        pathname: '/arcade/[mode]',
        params: { mode: slug, sessionId, categoryId: categoryId ?? '' },
      });
    } catch (e) {
      // The only realistic failure is an empty category, and saying so beats a
      // spinner that never resolves.
      setError(
        e instanceof Error && e.message.includes('no questions')
          ? 'That category has no questions yet. Pick another.'
          : 'Could not start the run. Check your connection.',
      );
    }
  }

  return (
    <ArcadeScreen edges={['top']}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => router.back()}
            hitSlop={12}
          >
            <Ionicons name="chevron-back" size={26} color={arcade.inkSoft} />
          </Pressable>
          <Text style={styles.kicker}>ARCADE</Text>
        </View>

        <Text style={styles.title}>Play for it.</Text>
        <Text style={styles.blurb}>
          Same questions, real stakes. Your best run this week goes on the board.
        </Text>

        {/* ------------------------------------------------------- category */}
        <Text style={styles.sectionLabel}>CATEGORY</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          <Chip
            label="Everything"
            active={categoryId === null}
            onPress={() => setCategoryId(null)}
          />
          {categories.map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              active={categoryId === c.id}
              onPress={() => setCategoryId(c.id)}
            />
          ))}
        </ScrollView>

        {/* ----------------------------------------------------------- modes */}
        <Text style={styles.sectionLabel}>MODE</Text>
        <View style={styles.modes}>
          {(modes.data ?? []).map((mode) => (
            <ModeCard
              key={mode.id}
              mode={mode}
              locked={level < mode.min_level}
              best={records.data?.[mode.slug]}
              onPress={() => void play(mode.slug)}
            />
          ))}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </ArcadeScreen>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.lg, paddingBottom: space.xxxl },

  header: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  kicker: {
    color: arcade.energy,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
  },

  title: {
    color: arcade.ink,
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '800',
    letterSpacing: -1,
    marginTop: space.lg,
  },
  blurb: {
    color: arcade.inkSoft,
    fontSize: 15,
    lineHeight: 22,
    marginTop: space.sm,
  },

  sectionLabel: {
    color: arcade.inkFaint,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginTop: space.xxl,
    marginBottom: space.md,
  },

  chips: { gap: space.sm, paddingRight: space.lg },
  chip: {
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: arcade.line,
    backgroundColor: arcade.surface,
  },
  chipActive: { borderColor: arcade.energy, backgroundColor: arcade.energyDim },
  chipText: { color: arcade.inkSoft, fontSize: 13, fontWeight: '700' },
  chipTextActive: { color: arcade.energy },

  modes: { gap: space.md },

  error: {
    color: arcade.hot,
    fontSize: 14,
    lineHeight: 20,
    marginTop: space.lg,
  },
});
