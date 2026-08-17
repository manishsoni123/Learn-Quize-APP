import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Tabs } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { Icon, type IconName } from '../../src/components/icons';
import { colors, radius, shadow, space } from '../../src/theme';

const TAB_ICON: Record<string, IconName> = {
  index: 'home',
  history: 'clock',
  leaderboard: 'chart',
  profile: 'person',
};

const TAB_LABEL: Record<string, string> = {
  index: 'Home',
  history: 'History',
  leaderboard: 'Leaderboard',
  profile: 'Profile',
};

/** The floating dark pill from the design — icon-only, active slot lit. */
function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { bottom: Math.max(insets.bottom, 10) + 8 }]}>
      {state.routes.map((route, index) => {
        const active = state.index === index;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityLabel={TAB_LABEL[route.name] ?? route.name}
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (!active) {
                void Haptics.selectionAsync();
                navigation.navigate(route.name);
              }
            }}
            style={[styles.slot, active && styles.slotActive]}
          >
            <Icon
              name={TAB_ICON[route.name] ?? 'home'}
              size={19}
              color={active ? colors.onDark : colors.onDarkSoft}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="history" />
      <Tabs.Screen name="leaderboard" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 6,
    backgroundColor: colors.brandInk,
    borderRadius: radius.pill,
    padding: space.sm,
    ...shadow.float,
  },
  slot: {
    width: 56,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotActive: { backgroundColor: 'rgba(255,255,255,0.14)' },
});
