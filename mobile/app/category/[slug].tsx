import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCategory } from '../../src/api/catalog';
import { MAX_QUESTIONS, MIN_QUESTIONS, useStartSession } from '../../src/api/player';
import { Icon, type IconName } from '../../src/components/icons';
import { ErrorView, Eyebrow, Loading, Spacer, Txt } from '../../src/components/ui';
import type { QuizMode } from '../../src/lib/database.types';
import { colors, fonts, radius, shadow, space, trackTint } from '../../src/theme';

interface ModeOption {
  mode: QuizMode;
  title: string;
  detail: string;
  icon: IconName;
  count: number;
}

/** Every quiz stays short on purpose: 10–15 questions, never more. */
const MODES: ModeOption[] = [
  {
    mode: 'practice',
    title: 'Practice',
    detail: `${MIN_QUESTIONS} questions · untimed · why, after every answer`,
    icon: 'book',
    count: MIN_QUESTIONS,
  },
  {
    mode: 'timed_test',
    title: 'Timed test',
    detail: `${MAX_QUESTIONS} questions · ${MAX_QUESTIONS} minutes · like the real thing`,
    icon: 'timer',
    count: MAX_QUESTIONS,
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
          ? 'This topic has no questions yet. Try another one.'
          : 'Could not start that quiz. Check your connection and try again.',
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
        <ErrorView title="Topic not found" onRetry={() => void query.refetch()} />
      </SafeAreaView>
    );
  }

  const { category, track } = query.data;
  const tint = trackTint(track.slug);
  const empty = category.approved_question_count === 0;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={styles.back}
          hitSlop={8}
        >
          <Icon name="chevronLeft" size={18} color={colors.inkMid} strokeWidth={2} />
        </Pressable>

        <Spacer h={space.lg + 2} />
        <Eyebrow>{`${track.name} track`}</Eyebrow>
        <Spacer h={space.sm} />
        <Text style={styles.title}>{category.name}</Text>
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
            <View style={styles.errorRow}>
              <Icon name="alert" size={13} color={colors.wrongInk} strokeWidth={2} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          </>
        ) : null}

        <Spacer h={space.xl} />
        <Eyebrow color={colors.inkFaint}>Choose how to practice</Eyebrow>
        <Spacer h={space.md} />

        <View style={styles.modeList}>
          {MODES.map((option) => (
            <Pressable
              key={option.mode}
              accessibilityRole="button"
              accessibilityLabel={`${option.title}. ${option.detail}`}
              disabled={empty || startSession.isPending}
              onPress={() => void start(option)}
              style={({ pressed }) => [
                styles.mode,
                pressed && styles.pressed,
                (empty || startSession.isPending) && styles.modeDisabled,
              ]}
            >
              <View style={[styles.modeIcon, { backgroundColor: tint.bg }]}>
                <Icon name={option.icon} size={19} color={tint.fg} />
              </View>
              <View style={styles.flex}>
                <Txt variant="bodyStrong">{option.title}</Txt>
                <Text style={styles.modeDetail}>{option.detail}</Text>
              </View>
              <Icon name="chevronRight" size={16} color={colors.inkFaint} strokeWidth={2} />
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
  body: { padding: space.xl, paddingTop: space.md, paddingBottom: space.xxxl },
  pressed: { opacity: 0.9 },

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

  title: { fontFamily: fonts.serif, fontSize: 32, lineHeight: 38, color: colors.ink },

  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  errorText: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.wrongInk,
  },

  modeList: { gap: space.md - 2 },
  mode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.lg,
    ...shadow.card,
  },
  modeDisabled: { opacity: 0.45 },
  modeIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeDetail: { fontFamily: fonts.sans, fontSize: 12, color: colors.inkSoft, marginTop: 2 },
});
