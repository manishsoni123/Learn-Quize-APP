import React from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLeague } from '../../src/api/me';
import { EmptyState, Label, Loading, Spacer, Txt } from '../../src/components/ui';
import { useAuth } from '../../src/lib/auth';
import { colors, radius, space, tierColor } from '../../src/theme';

/** Rooms hold 30. Top 10 promote, bottom 5 relegate. */
const PROMOTION_ZONE = 10;
const RELEGATION_SIZE = 5;

export default function LeagueScreen() {
  const { userId } = useAuth();
  const league = useLeague(userId);

  if (league.isLoading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <Loading label="Loading your league" />
      </SafeAreaView>
    );
  }

  if (!league.data) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <EmptyState
          title="No league yet"
          detail="Finish a quiz to be placed in a room. You compete against about 30 people at your own level, and it resets every Monday."
        />
      </SafeAreaView>
    );
  }

  const { tier, rows, myRank } = league.data;
  const accent = tierColor(tier);
  const relegationFrom = Math.max(rows.length - RELEGATION_SIZE + 1, PROMOTION_ZONE + 1);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Label color={accent}>{tier} league</Label>
        <Spacer h={space.xs} />
        <Txt variant="title">
          {myRank ? `You are ${ordinal(myRank)}` : 'This week'}
        </Txt>
        <Spacer h={space.xs} />
        <Txt variant="small" tone="faint">
          Top {PROMOTION_ZONE} move up · bottom {RELEGATION_SIZE} move down · resets Monday
        </Txt>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(r) => r.userId}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={league.isRefetching}
            onRefresh={() => void league.refetch()}
            tintColor={colors.inkFaint}
          />
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => {
          const promoting = item.rank <= PROMOTION_ZONE;
          const relegating = item.rank >= relegationFrom;

          return (
            <View style={[styles.row, item.isMe && styles.rowMe]}>
              <View
                style={[
                  styles.rankWrap,
                  promoting && { backgroundColor: colors.correctDim },
                  relegating && { backgroundColor: colors.wrongDim },
                ]}
              >
                <Txt
                  variant="caption"
                  tone={promoting ? 'accent' : relegating ? 'wrong' : 'faint'}
                >
                  {item.rank}
                </Txt>
              </View>

              <View style={styles.flex}>
                <Txt variant="bodyStrong" numberOfLines={1}>
                  {item.displayName}
                  {item.isMe ? '  ·  you' : ''}
                </Txt>
              </View>

              <Txt variant="bodyStrong" tone={item.isMe ? 'accent' : 'soft'}>
                {item.xp.toLocaleString()}
              </Txt>
              <Txt variant="caption" tone="faint">
                {' '}
                XP
              </Txt>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { padding: space.lg, paddingBottom: space.md },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxxl },
  separator: { height: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  rowMe: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  rankWrap: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
