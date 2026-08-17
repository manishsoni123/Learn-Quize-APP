import React, { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLeaderboard, type LeaderboardRow } from '../../src/api/leaderboard';
import { EmptyState, ErrorView, Loading, Segmented, Spacer, Txt } from '../../src/components/ui';
import { colors, fonts, radius, space } from '../../src/theme';

const SCOPES = ['This week', 'All time'] as const;

export default function LeaderboardScreen() {
  const [scope, setScope] = useState<string>(SCOPES[0]);
  const allTime = scope === SCOPES[1];
  const board = useLeaderboard(allTime);

  const rows = board.data ?? [];
  const podium = rows.filter((r) => r.rank <= 3);
  const rest = rows.filter((r) => r.rank > 3);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={board.isRefetching}
            onRefresh={() => void board.refetch()}
            tintColor={colors.inkFaint}
          />
        }
      >
        <Text style={styles.title}>Leaderboard</Text>
        <Spacer h={3} />
        <Txt variant="small" tone="soft">
          {allTime ? 'Average score, all time' : 'Average score, this week · resets Monday'}
        </Txt>

        <Spacer h={space.lg} />
        <Segmented options={SCOPES} value={scope} onChange={setScope} dark />

        {board.isLoading ? (
          <View style={styles.stateWrap}>
            <Loading />
          </View>
        ) : board.isError ? (
          <View style={styles.stateWrap}>
            <ErrorView
              title="Could not load the board"
              detail="Check your connection and try again."
              onRetry={() => void board.refetch()}
            />
          </View>
        ) : rows.length === 0 ? (
          <View style={styles.stateWrap}>
            <EmptyState
              title="No scores yet"
              detail={
                allTime
                  ? 'Finish a quiz and you will be the first name on the board.'
                  : 'Nobody has finished a quiz this week. Yours could be the first score up here.'
              }
            />
          </View>
        ) : (
          <>
            {/* ---------------------------------------------------- podium */}
            {podium.length > 0 ? (
              <>
                <Spacer h={space.xl} />
                <View style={styles.podium}>
                  {[2, 1, 3]
                    .map((place) => podium.find((r) => r.rank === place))
                    .map((row, i) =>
                      row ? (
                        <PodiumSpot key={row.userId} row={row} />
                      ) : (
                        <View key={`empty-${i}`} style={styles.podiumSpot} />
                      ),
                    )}
                </View>
              </>
            ) : null}

            {/* ------------------------------------------------------ list */}
            <Spacer h={space.sm} />
            <View>
              {rest.map((row) => (
                <ListRow key={row.userId} row={row} />
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function PodiumSpot({ row }: { row: LeaderboardRow }) {
  const first = row.rank === 1;
  const avatar = {
    1: { bg: colors.brandDark, fg: colors.onDark },
    2: { bg: colors.line, fg: colors.brandDeep },
    3: { bg: colors.warmWash, fg: colors.warmInk },
  }[row.rank as 1 | 2 | 3];
  const bar = {
    1: { height: 50, bg: colors.brandDark, fg: colors.onDark },
    2: { height: 34, bg: colors.line, fg: colors.brandDeep },
    3: { height: 26, bg: colors.warmLine, fg: colors.warmInk },
  }[row.rank as 1 | 2 | 3];

  return (
    <View
      style={styles.podiumSpot}
      accessibilityLabel={`Rank ${row.rank}: ${row.name}, ${row.score} percent`}
    >
      <View
        style={[
          styles.podiumAvatar,
          { backgroundColor: avatar.bg },
          first && styles.podiumAvatarFirst,
        ]}
      >
        <Text style={[styles.podiumInitials, { color: avatar.fg }, first && { fontSize: 20 }]}>
          {initials(row.name)}
        </Text>
      </View>
      <Text style={styles.podiumName} numberOfLines={1}>
        {row.isMe ? 'You' : row.name}
      </Text>
      <Text style={styles.podiumScore}>{row.score}%</Text>
      <View style={[styles.podiumBar, { height: bar.height, backgroundColor: bar.bg }]}>
        <Text style={[styles.podiumRank, { color: bar.fg }]}>{row.rank}</Text>
      </View>
    </View>
  );
}

function ListRow({ row }: { row: LeaderboardRow }) {
  return (
    <View
      style={[styles.row, row.isMe && styles.rowMe]}
      accessibilityLabel={`Rank ${row.rank}: ${row.isMe ? 'you' : row.name}, ${row.score} percent`}
    >
      <Text style={[styles.rowRank, row.isMe && { color: colors.brandDeep }]}>{row.rank}</Text>
      <View style={[styles.rowAvatar, row.isMe && { backgroundColor: colors.brand }]}>
        <Text style={[styles.rowInitials, row.isMe && { color: colors.onDark }]}>
          {initials(row.name)}
        </Text>
      </View>
      <Text
        style={[styles.rowName, row.isMe && { fontFamily: fonts.sansSemiBold }]}
        numberOfLines={1}
      >
        {row.isMe ? 'You' : row.name}
      </Text>
      <Text style={styles.rowScore}>{row.score}%</Text>
    </View>
  );
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((word) => word.charAt(0))
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?'
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.xl, paddingTop: space.lg, paddingBottom: 128, flexGrow: 1 },
  stateWrap: { flex: 1, minHeight: 320 },

  title: { fontFamily: fonts.serif, fontSize: 27, lineHeight: 33, color: colors.ink },

  podium: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 14,
  },
  podiumSpot: { width: 92, alignItems: 'center' },
  podiumAvatar: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  podiumAvatarFirst: {
    width: 60,
    height: 60,
    borderWidth: 2.5,
    borderColor: colors.warm,
  },
  podiumInitials: { fontFamily: fonts.sansSemiBold, fontSize: 18 },
  podiumName: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 12.5,
    color: colors.ink,
    marginTop: 6,
    maxWidth: 88,
  },
  podiumScore: {
    fontFamily: fonts.serif,
    fontSize: 17,
    color: colors.brandInk,
    fontVariant: ['tabular-nums'],
  },
  podiumBar: {
    alignSelf: 'stretch',
    borderTopLeftRadius: radius.sm,
    borderTopRightRadius: radius.sm,
    marginTop: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  podiumRank: { fontFamily: fonts.monoMedium, fontSize: 13 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 13,
    paddingHorizontal: space.xs,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  rowMe: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.brand,
    borderRadius: radius.md + 2,
    paddingHorizontal: space.md,
    marginVertical: 4,
  },
  rowRank: {
    fontFamily: fonts.monoMedium,
    fontSize: 13,
    color: colors.inkFaint,
    width: 20,
    fontVariant: ['tabular-nums'],
  },
  rowAvatar: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowInitials: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.inkMid },
  rowName: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 14, color: colors.ink },
  rowScore: {
    fontFamily: fonts.serif,
    fontSize: 16,
    color: colors.brandInk,
    fontVariant: ['tabular-nums'],
  },
});
