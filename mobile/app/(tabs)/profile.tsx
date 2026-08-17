import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useHistory, useProfile } from '../../src/api/me';
import { StreakChip } from '../../src/components/game';
import { Icon } from '../../src/components/icons';
import { Loading, Spacer } from '../../src/components/ui';
import { signOut, useAuth } from '../../src/lib/auth';
import { colors, fonts, radius, shadow, space, tealGradient } from '../../src/theme';

export default function ProfileScreen() {
  const { userId } = useAuth();
  const profile = useProfile(userId);
  const history = useHistory(userId, 100);

  if (profile.isLoading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <Loading />
      </SafeAreaView>
    );
  }

  const me = profile.data;
  const name = me?.display_name ?? me?.username ?? 'Your profile';
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  const quizzes = history.data?.length ?? 0;
  const questionsAnswered =
    history.data?.reduce((sum, entry) => sum + entry.total, 0) ?? 0;

  return (
    <View style={styles.screen}>
      {/* The teal band behind the header. */}
      <LinearGradient
        colors={[tealGradient[0], tealGradient[2]]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.band}
      />
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={profile.isRefetching}
              onRefresh={() => {
                void profile.refetch();
                void history.refetch();
              }}
              tintColor={colors.onDarkSoft}
            />
          }
        >
          <Text style={styles.title}>Profile</Text>

          {/* ------------------------------------------------------ identity */}
          <Spacer h={space.lg} />
          <View style={styles.identity}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.name} numberOfLines={1}>
                {name}
              </Text>
              {me?.username ? (
                <Text style={styles.username} numberOfLines={1}>
                  @{me.username}
                </Text>
              ) : null}
            </View>
            <StreakChip days={me?.current_streak ?? 0} />
          </View>

          {/* --------------------------------------------------------- stats */}
          <Spacer h={space.md + 2} />
          <View style={styles.statGrid}>
            <Stat value={quizzes} label="quizzes finished" />
            <Stat value={questionsAnswered} label="questions answered" />
            <Stat value={me?.current_streak ?? 0} label="current streak" />
            <Stat value={me?.longest_streak ?? 0} label="best streak" />
          </View>

          {/* ------------------------------------------------------- actions */}
          <Spacer h={space.lg} />
          <View style={styles.list}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign out"
              onPress={() => void signOut()}
              style={({ pressed }) => [styles.listRow, pressed && styles.pressed]}
            >
              <Icon name="signOut" size={17} color={colors.wrong} strokeWidth={1.6} />
              <Text style={styles.signOutLabel}>Sign out</Text>
            </Pressable>
          </View>

          <Spacer h={space.xl} />
          <Text style={styles.footer}>
            Learn-Quize · a little every day, interview-ready
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value.toLocaleString()}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.bg },
  band: { position: 'absolute', top: 0, left: 0, right: 0, height: 190 },
  body: { padding: space.xl, paddingTop: space.lg, paddingBottom: 128 },

  title: { fontFamily: fonts.serif, fontSize: 26, lineHeight: 32, color: colors.onDark },

  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg + 4,
    padding: space.xl - 4,
    ...shadow.card,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: fonts.serif, fontSize: 26, color: colors.onDark },
  name: { fontFamily: fonts.sansSemiBold, fontSize: 16, color: colors.ink },
  username: { fontFamily: fonts.mono, fontSize: 13, color: colors.inkSoft, marginTop: 1 },

  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md - 2 },
  stat: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: space.lg,
  },
  statValue: {
    fontFamily: fonts.serif,
    fontSize: 28,
    lineHeight: 30,
    color: colors.brandInk,
    fontVariant: ['tabular-nums'],
  },
  statLabel: { fontFamily: fonts.sans, fontSize: 12, color: colors.inkSoft, marginTop: 5 },

  list: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 14,
    paddingHorizontal: space.lg,
  },
  pressed: { opacity: 0.7 },
  signOutLabel: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.wrong },

  footer: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.inkFaint,
    textAlign: 'center',
  },
});
