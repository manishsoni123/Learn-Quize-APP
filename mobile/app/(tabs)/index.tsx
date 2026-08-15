import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCatalog } from '../../src/api/catalog';
import { useDueCount, useProfile } from '../../src/api/me';
import { useStartSession } from '../../src/api/player';
import { CategoryCard, StreakBadge, XpBar } from '../../src/components/game';
import {
  Card,
  ErrorView,
  Label,
  Loading,
  Spacer,
  Txt,
} from '../../src/components/ui';
import { useAuth } from '../../src/lib/auth';
import { colors, radius, space, trackColor } from '../../src/theme';
import { arcade } from '../../src/theme/arcade';

export default function HomeScreen() {
  const router = useRouter();
  const { userId } = useAuth();

  const catalog = useCatalog();
  const profile = useProfile(userId);
  const due = useDueCount(userId);
  const startSession = useStartSession();

  const refreshing =
    catalog.isRefetching || profile.isRefetching || due.isRefetching;

  function refresh() {
    void catalog.refetch();
    void profile.refetch();
    void due.refetch();
  }

  async function startQuickSession(
    mode: 'daily_challenge' | 'weak_spots',
    count: number,
  ) {
    try {
      const sessionId = await startSession.mutateAsync({
        mode,
        categoryId: null,
        questionCount: count,
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
        <Loading label="Loading your tracks" />
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
            <Label>{greeting()}</Label>
            <Spacer h={space.xs} />
            <Txt variant="title">{firstName || 'Ready to learn'}</Txt>
          </View>
          <StreakBadge days={me?.current_streak ?? 0} />
        </View>

        <Spacer h={space.lg} />
        <Card>
          <XpBar xp={me?.xp ?? 0} />
        </Card>

        {/* ----------------------------------------------------------- lanes */}
        {/*
          Two doors, not a mode dropdown. They are different promises: Focus is
          untimed and forgiving and will let you sit on a question, Arcade puts
          something at stake and takes it back if you get it wrong. Presenting
          that as a setting inside one flow would hide the choice that matters
          most, which is what kind of session someone is in the mood for.
        */}
        <Spacer h={space.lg} />
        <View style={styles.quickRow}>
          <QuickAction
            title="Daily challenge"
            detail="5 questions, same for everyone"
            glyph="🎯"
            accent={colors.accent}
            onPress={() => void startQuickSession('daily_challenge', 5)}
          />
          <QuickAction
            title="Weak spots"
            detail={
              dueCount > 0
                ? `${dueCount} due for review`
                : 'Nothing due — come back later'
            }
            glyph="🧠"
            accent={colors.signal}
            disabled={dueCount === 0}
            onPress={() => void startQuickSession('weak_spots', 10)}
          />
        </View>

        <Spacer h={space.md} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open Arcade"
          onPress={() => router.push('/arcade')}
          style={({ pressed }) => [styles.arcade, pressed && { opacity: 0.85 }]}
        >
          <View style={styles.flex}>
            <Text style={styles.arcadeKicker}>ARCADE</Text>
            <Spacer h={space.xs} />
            <Txt variant="bodyStrong">Play for it</Txt>
            <Spacer h={space.xs} />
            <Txt variant="caption" tone="faint">
              Ladder, Survival and Blitz — same questions, real stakes
            </Txt>
          </View>
          <Text style={styles.arcadeGlyph}>🕹️</Text>
        </Pressable>

        {/* ----------------------------------------------------------- tracks */}
        {catalog.data?.map((track) => (
          <View key={track.id}>
            <Spacer h={space.xxl} />
            <View style={styles.trackHeader}>
              <View style={[styles.trackDot, { backgroundColor: trackColor(track.slug) }]} />
              <Txt variant="heading">{track.name}</Txt>
            </View>
            {track.description ? (
              <>
                <Spacer h={space.xs} />
                <Txt variant="small" tone="faint">
                  {track.description}
                </Txt>
              </>
            ) : null}
            <Spacer h={space.md} />
            <View style={styles.categoryList}>
              {track.categories.map((category) => (
                <CategoryCard
                  key={category.id}
                  category={category}
                  trackSlug={track.slug}
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

function QuickAction({
  title,
  detail,
  glyph,
  accent,
  onPress,
  disabled = false,
}: {
  title: string;
  detail: string;
  glyph: string;
  accent: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.quick,
        { borderColor: disabled ? colors.line : accent },
        pressed && !disabled && { opacity: 0.85 },
        disabled && { opacity: 0.5 },
      ]}
    >
      <Txt variant="heading">{glyph}</Txt>
      <Spacer h={space.sm} />
      <Txt variant="bodyStrong">{title}</Txt>
      <Spacer h={space.xs} />
      <Txt variant="caption" tone="faint">
        {detail}
      </Txt>
    </Pressable>
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
  body: { padding: space.lg, paddingBottom: space.xxxl },

  header: { flexDirection: 'row', alignItems: 'center', gap: space.lg },

  quickRow: { flexDirection: 'row', gap: space.md },

  // Borrows the Arcade palette rather than the Focus one — the card is a door
  // into another room and should look like it from this side.
  arcade: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: arcade.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: arcade.energy,
    padding: space.lg,
  },
  arcadeKicker: {
    color: arcade.energy,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  arcadeGlyph: { fontSize: 30 },
  quick: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space.lg,
    minHeight: 128,
  },

  trackHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  trackDot: { width: 8, height: 8, borderRadius: radius.pill },

  categoryList: { gap: space.md },
});
