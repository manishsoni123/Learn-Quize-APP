import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCatalog } from '../../src/api/catalog';
import { useDueCount, useHistory, useProfile } from '../../src/api/me';
import { MIN_QUESTIONS, useStartSession } from '../../src/api/player';
import { CategoryRow, StreakChip } from '../../src/components/game';
import { Icon } from '../../src/components/icons';
import { ErrorView, Eyebrow, Loading, Spacer, Txt } from '../../src/components/ui';
import { useAuth } from '../../src/lib/auth';
import { colors, fonts, radius, shadow, space, tealGradient } from '../../src/theme';

export default function HomeScreen() {
  const router = useRouter();
  const { userId } = useAuth();

  const catalog = useCatalog();
  const profile = useProfile(userId);
  const due = useDueCount(userId);
  const history = useHistory(userId, 100);
  const startSession = useStartSession();

  const refreshing =
    catalog.isRefetching || profile.isRefetching || due.isRefetching;

  function refresh() {
    void catalog.refetch();
    void profile.refetch();
    void due.refetch();
    void history.refetch();
  }

  /** Average past score per category name, for the 86/% mark on rows. */
  const accuracyByCategory = useMemo(() => {
    const sums = new Map<string, { total: number; count: number }>();
    for (const entry of history.data ?? []) {
      if (!entry.categoryName || entry.total === 0) continue;
      const bucket = sums.get(entry.categoryName) ?? { total: 0, count: 0 };
      bucket.total += entry.correct / entry.total;
      bucket.count += 1;
      sums.set(entry.categoryName, bucket);
    }
    const out = new Map<string, number>();
    for (const [name, { total, count }] of sums) {
      out.set(name, Math.round((total / count) * 100));
    }
    return out;
  }, [history.data]);

  async function startQuickSession(mode: 'practice' | 'weak_spots') {
    try {
      const sessionId = await startSession.mutateAsync({
        mode,
        categoryId: null,
        questionCount: MIN_QUESTIONS,
      });
      router.push({ pathname: '/quiz/[sessionId]', params: { sessionId } });
    } catch {
      // start_quiz_session raises P0002 when nothing matches. The buttons that
      // can hit that are already gated on a count, so this is rare — swallow
      // it rather than throwing a modal at someone mid-tap.
    }
  }

  if (catalog.isLoading || profile.isLoading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <Loading label="Loading your topics" />
      </SafeAreaView>
    );
  }

  if (catalog.isError) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ErrorView
          title="Could not reach the server"
          detail="Check your connection and try again."
          onRetry={refresh}
        />
      </SafeAreaView>
    );
  }

  const me = profile.data;
  const dueCount = due.data ?? 0;
  const firstName = (me?.display_name ?? me?.username ?? '').split(' ')[0];
  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.inkFaint}
          />
        }
      >
        {/* ---------------------------------------------------------- header */}
        <View style={styles.header}>
          <View style={styles.flex}>
            <Txt variant="caption" tone="soft">
              {today}
            </Txt>
            <Text style={styles.greeting}>
              {greeting()}
              {firstName ? `, ${firstName}` : ''}
            </Text>
          </View>
          <StreakChip days={me?.current_streak ?? 0} />
        </View>

        {/* ------------------------------------------------------ quick quiz */}
        <Spacer h={space.lg + 2} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Start a quick quiz, ${MIN_QUESTIONS} mixed questions`}
          disabled={startSession.isPending}
          onPress={() => void startQuickSession('practice')}
          style={({ pressed }) => [styles.hero, pressed && styles.pressed]}
        >
          <LinearGradient
            colors={[tealGradient[0], tealGradient[2]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={styles.heroFill}
          >
            <View style={styles.heroRing} />
            <Eyebrow color={colors.cyan}>Quick quiz</Eyebrow>
            <Text style={styles.heroCopy}>
              {MIN_QUESTIONS} mixed questions,{'\n'}one coffee break.
            </Text>
            <View style={styles.heroButton}>
              <Text style={styles.heroButtonLabel}>Start now</Text>
              <Icon name="arrowRight" size={15} color={colors.brandInk} strokeWidth={2} />
            </View>
          </LinearGradient>
        </Pressable>

        {/* ---------------------------------------------------------- review */}
        {dueCount > 0 ? (
          <>
            <Spacer h={space.md} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Review your mistakes, ${dueCount} questions due today`}
              disabled={startSession.isPending}
              onPress={() => void startQuickSession('weak_spots')}
              style={({ pressed }) => [styles.review, pressed && styles.pressed]}
            >
              <View style={styles.reviewIcon}>
                <Icon name="refresh" size={17} color={colors.warn} />
              </View>
              <View style={styles.flex}>
                <Txt variant="bodyStrong">Review your mistakes</Txt>
                <Txt variant="caption" tone="soft">
                  {dueCount} {dueCount === 1 ? 'question' : 'questions'} due today
                </Txt>
              </View>
              <Icon name="chevronRight" size={16} color={colors.inkFaint} strokeWidth={2} />
            </Pressable>
          </>
        ) : null}

        {/* ---------------------------------------------------------- tracks */}
        {catalog.data?.map((track) => (
          <View key={track.id}>
            <Spacer h={space.xl} />
            <View style={styles.trackHead}>
              <Eyebrow>{`${track.name} track`}</Eyebrow>
            </View>
            <Spacer h={space.md} />
            <View style={styles.categoryList}>
              {track.categories.map((category) => (
                <CategoryRow
                  key={category.id}
                  category={category}
                  trackSlug={track.slug}
                  accuracy={accuracyByCategory.get(category.name) ?? null}
                  onPress={() =>
                    router.push({
                      pathname: '/category/[slug]',
                      params: { slug: category.slug },
                    })
                  }
                />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.bg },
  // Extra bottom room so content scrolls clear of the floating tab bar.
  body: { padding: space.xl, paddingTop: space.lg, paddingBottom: 128 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.995 }] },

  header: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  greeting: {
    fontFamily: fonts.serif,
    fontSize: 27,
    lineHeight: 33,
    color: colors.ink,
    marginTop: 2,
  },

  hero: { borderRadius: radius.xl, ...shadow.card },
  heroFill: { borderRadius: radius.xl, padding: 22, overflow: 'hidden' },
  heroRing: {
    position: 'absolute',
    right: -10,
    top: -10,
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 22,
    borderColor: 'rgba(95,207,222,0.12)',
  },
  heroCopy: {
    fontFamily: fonts.serif,
    fontSize: 22,
    lineHeight: 28,
    color: colors.onDark,
    marginTop: space.sm,
  },
  heroButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    height: 44,
    backgroundColor: colors.sheet,
    borderRadius: radius.md,
    paddingHorizontal: 18,
    marginTop: space.lg,
  },
  heroButtonLabel: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.brandInk },

  review: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 14,
    paddingHorizontal: space.lg,
  },
  reviewIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.warnWash,
    alignItems: 'center',
    justifyContent: 'center',
  },

  trackHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  categoryList: { gap: space.sm },
});
