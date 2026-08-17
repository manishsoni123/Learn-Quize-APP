import { useRouter } from 'expo-router';
import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useHistory, type HistoryEntry } from '../../src/api/me';
import { Fraction } from '../../src/components/game';
import { EmptyState, ErrorView, Loading, Spacer, Txt } from '../../src/components/ui';
import { useAuth } from '../../src/lib/auth';
import { modeLabel } from '../../src/lib/labels';
import { colors, fonts, radius, space } from '../../src/theme';

export default function HistoryScreen() {
  const router = useRouter();
  const { userId } = useAuth();
  const history = useHistory(userId, 100);

  if (history.isLoading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <Loading />
      </SafeAreaView>
    );
  }

  if (history.isError) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ErrorView
          title="Could not load your history"
          detail="Check your connection and try again."
          onRetry={() => void history.refetch()}
        />
      </SafeAreaView>
    );
  }

  const entries = history.data ?? [];
  const scored = entries.filter((e) => e.total > 0);
  const average =
    scored.length > 0
      ? Math.round(
          (scored.reduce((sum, e) => sum + e.correct / e.total, 0) / scored.length) * 100,
        )
      : 0;
  const best =
    scored.length > 0
      ? Math.max(...scored.map((e) => Math.round((e.correct / e.total) * 100)))
      : 0;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={history.isRefetching}
            onRefresh={() => void history.refetch()}
            tintColor={colors.inkFaint}
          />
        }
      >
        <Text style={styles.title}>History</Text>
        <Spacer h={3} />
        <Txt variant="small" tone="soft">
          Every quiz you have finished
        </Txt>

        {entries.length === 0 ? (
          <View style={styles.empty}>
            <EmptyState
              title="No quizzes yet"
              detail="Finish your first quiz and your scores will show up here."
              action={{
                label: 'Start practicing',
                onPress: () => router.push('/(tabs)'),
              }}
            />
          </View>
        ) : (
          <>
            {/* -------------------------------------------------- summary */}
            <Spacer h={space.lg} />
            <View style={styles.statRow}>
              <Stat value={String(entries.length)} label="quizzes" />
              <Stat value={`${average}%`} label="average" />
              <Stat value={`${best}%`} label="best" />
            </View>

            {/* ----------------------------------------------------- list */}
            <Spacer h={space.xl} />
            <View style={styles.list}>
              {entries.map((entry) => (
                <HistoryRow key={entry.id} entry={entry} />
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  return (
    <View
      style={styles.row}
      accessibilityLabel={`${entry.categoryName ?? modeLabel(entry.mode)}, ${entry.correct} of ${entry.total} correct`}
    >
      <View style={styles.flex}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {entry.categoryName ?? modeLabel(entry.mode)}
        </Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {modeLabel(entry.mode)} · {relativeDay(entry.finishedAt)}
        </Text>
      </View>
      <Fraction top={String(entry.correct)} bottom={String(entry.total)} size="sm" />
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function relativeDay(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.xl, paddingTop: space.lg, paddingBottom: 128, flexGrow: 1 },
  empty: { flex: 1, minHeight: 360 },

  title: { fontFamily: fonts.serif, fontSize: 27, lineHeight: 33, color: colors.ink },

  statRow: { flexDirection: 'row', gap: space.md - 2 },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: space.lg,
  },
  statValue: {
    fontFamily: fonts.serif,
    fontSize: 26,
    lineHeight: 28,
    color: colors.brandInk,
    fontVariant: ['tabular-nums'],
  },
  statLabel: { fontFamily: fonts.sans, fontSize: 12, color: colors.inkSoft, marginTop: 4 },

  list: { gap: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    paddingVertical: 13,
    paddingHorizontal: space.lg,
  },
  rowTitle: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.ink },
  rowSub: { fontFamily: fonts.sans, fontSize: 12, color: colors.inkSoft, marginTop: 2 },
});
