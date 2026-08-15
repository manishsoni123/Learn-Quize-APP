import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAchievements, useHistory, useProfile } from '../../src/api/me';
import { XpBar } from '../../src/components/game';
import {
  Button,
  Card,
  Divider,
  Label,
  Loading,
  Spacer,
  Txt,
} from '../../src/components/ui';
import { signOut, useAuth } from '../../src/lib/auth';
import { colors, radius, space } from '../../src/theme';

export default function ProfileScreen() {
  const { userId } = useAuth();
  const profile = useProfile(userId);
  const achievements = useAchievements(userId);
  const history = useHistory(userId, 10);

  if (profile.isLoading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <Loading />
      </SafeAreaView>
    );
  }

  const me = profile.data;
  const earned = achievements.data?.filter((a) => a.earnedAt) ?? [];
  const locked = achievements.data?.filter((a) => !a.earnedAt) ?? [];

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={profile.isRefetching}
            onRefresh={() => {
              void profile.refetch();
              void achievements.refetch();
              void history.refetch();
            }}
            tintColor={colors.inkFaint}
          />
        }
      >
        <Txt variant="title">{me?.display_name ?? me?.username ?? 'Your profile'}</Txt>
        <Spacer h={space.lg} />

        <Card>
          <XpBar xp={me?.xp ?? 0} />
          <Spacer h={space.lg} />
          <Divider />
          <Spacer h={space.lg} />
          <View style={styles.statRow}>
            <Stat value={(me?.xp ?? 0).toLocaleString()} label="total XP" />
            <Stat value={String(me?.current_streak ?? 0)} label="day streak" />
            <Stat value={String(me?.longest_streak ?? 0)} label="best streak" />
          </View>
        </Card>

        {/* --------------------------------------------------------- badges */}
        <Spacer h={space.xxl} />
        <Label>
          Badges · {earned.length} of {(achievements.data ?? []).length}
        </Label>
        <Spacer h={space.md} />
        <View style={styles.badgeGrid}>
          {[...earned, ...locked].map((a) => (
            <View
              key={a.id}
              style={[styles.badge, !a.earnedAt && styles.badgeLocked]}
            >
              <Txt variant="heading">{a.earnedAt ? (a.icon ?? '🏅') : '🔒'}</Txt>
              <Spacer h={space.xs} />
              <Txt variant="caption" tone={a.earnedAt ? 'default' : 'faint'} numberOfLines={2}>
                {a.name}
              </Txt>
              <Spacer h={space.xs} />
              <Txt variant="caption" tone="faint" numberOfLines={2}>
                {a.description}
              </Txt>
            </View>
          ))}
        </View>

        {/* -------------------------------------------------------- history */}
        <Spacer h={space.xxl} />
        <Label>Recent sessions</Label>
        <Spacer h={space.md} />
        {(history.data ?? []).length === 0 ? (
          <Txt variant="small" tone="faint">
            Nothing yet. Your finished quizzes will show up here.
          </Txt>
        ) : (
          <View style={styles.historyList}>
            {history.data?.map((h) => (
              <View key={h.id} style={styles.historyRow}>
                <View style={styles.flex}>
                  <Txt variant="bodyStrong" numberOfLines={1}>
                    {h.categoryName ?? modeLabel(h.mode)}
                  </Txt>
                  <Txt variant="caption" tone="faint">
                    {modeLabel(h.mode)} · {relativeDay(h.finishedAt)}
                  </Txt>
                </View>
                <View style={styles.historyScore}>
                  <Txt variant="bodyStrong" tone={h.correct === h.total ? 'accent' : 'default'}>
                    {h.correct}/{h.total}
                  </Txt>
                  <Txt variant="caption" tone="faint">
                    +{h.xp} XP
                  </Txt>
                </View>
              </View>
            ))}
          </View>
        )}

        <Spacer h={space.xxl} />
        <Button label="Sign out" variant="secondary" onPress={() => void signOut()} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Txt variant="title">{value}</Txt>
      <Spacer h={space.xs} />
      <Label>{label}</Label>
    </View>
  );
}

function modeLabel(mode: string): string {
  return (
    {
      practice: 'Practice',
      timed_test: 'Timed test',
      rapid_fire: 'Rapid fire',
      daily_challenge: 'Daily challenge',
      weak_spots: 'Weak spots',
    }[mode] ?? mode
  );
}

function relativeDay(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.lg, paddingBottom: space.xxxl },

  statRow: { flexDirection: 'row' },
  stat: { flex: 1 },

  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  badge: {
    width: '31%',
    minHeight: 118,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.md,
  },
  badgeLocked: { opacity: 0.45, borderStyle: 'dashed' },

  historyList: { gap: space.sm },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.lg,
  },
  historyScore: { alignItems: 'flex-end' },
});
