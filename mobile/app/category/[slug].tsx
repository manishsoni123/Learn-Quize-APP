import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCategory } from '../../src/api/catalog';
import { useStartSession } from '../../src/api/player';
import { ErrorView, Label, Loading, Spacer, Txt } from '../../src/components/ui';
import type { QuizMode } from '../../src/lib/database.types';
import { colors, radius, space, trackColor } from '../../src/theme';

interface ModeOption {
  mode: QuizMode;
  title: string;
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
  count: number;
}

const MODES: ModeOption[] = [
  {
    mode: 'practice',
    title: 'Practice',
    detail: 'Untimed. Explanation after every answer.',
    icon: 'book-outline',
    count: 10,
  },
  {
    mode: 'timed_test',
    title: 'Timed test',
    detail: '20 questions, 20 minutes, results at the end.',
    icon: 'timer-outline',
    count: 20,
  },
  {
    mode: 'rapid_fire',
    title: 'Rapid fire',
    detail: '60 seconds. As many as you can.',
    icon: 'flash-outline',
    count: 20,
  },
];

export default function CategoryScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const query = useCategory(slug);
  const startSession = useStartSession();

  const [error, setError] = React.useState<string | null>(null);

  async function start(option: ModeOption) {
    if (!query.data) return;
    setError(null);
    try {
      const sessionId = await startSession.mutateAsync({
        mode: option.mode,
        categoryId: query.data.category.id,
        questionCount: option.count,
      });
      router.push({ pathname: '/quiz/[sessionId]', params: { sessionId } });
    } catch (e) {
      const message = e instanceof Error ? e.message : '';
      setError(
        message.includes('no questions available')
          ? 'This category has no approved questions yet. Try another one.'
          : 'Could not start that session. Check your connection and try again.',
      );
    }
  }

  if (query.isLoading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <Loading />
      </SafeAreaView>
    );
  }

  if (query.isError || !query.data) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ErrorView
          title="Category not found"
          onRetry={() => void query.refetch()}
        />
      </SafeAreaView>
    );
  }

  const { category, track } = query.data;
  const accent = trackColor(track.slug);
  const empty = category.approved_question_count === 0;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={styles.back}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={22} color={colors.inkSoft} />
        </Pressable>

        <Spacer h={space.md} />
        <Label color={accent}>{track.name}</Label>
        <Spacer h={space.sm} />
        <Txt variant="display">{category.name}</Txt>
        {category.description ? (
          <>
            <Spacer h={space.sm} />
            <Txt variant="body" tone="soft">
              {category.description}
            </Txt>
          </>
        ) : null}
        <Spacer h={space.md} />
        <Txt variant="small" tone="faint">
          {category.approved_question_count.toLocaleString()} questions available
        </Txt>

        {error ? (
          <>
            <Spacer h={space.lg} />
            <Txt variant="small" tone="wrong">
              {error}
            </Txt>
          </>
        ) : null}

        <Spacer h={space.xl} />
        <Label>Choose a mode</Label>
        <Spacer h={space.md} />

        <View style={styles.modeList}>
          {MODES.map((option) => (
            <Pressable
              key={option.mode}
              accessibilityRole="button"
              disabled={empty || startSession.isPending}
              onPress={() => void start(option)}
              style={({ pressed }) => [
                styles.mode,
                pressed && styles.pressed,
                (empty || startSession.isPending) && styles.modeDisabled,
              ]}
            >
              <View style={[styles.modeIcon, { borderColor: accent }]}>
                <Ionicons name={option.icon} size={20} color={accent} />
              </View>
              <View style={styles.flex}>
                <Txt variant="bodyStrong">{option.title}</Txt>
                <Spacer h={space.xs} />
                <Txt variant="caption" tone="faint">
                  {option.detail}
                </Txt>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.lg, paddingBottom: space.xxxl },
  pressed: { opacity: 0.85 },

  back: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },

  modeList: { gap: space.md },
  mode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.lg,
  },
  modeDisabled: { opacity: 0.45 },
  modeIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
