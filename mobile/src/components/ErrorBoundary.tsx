import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, space } from '../theme';
import { Button, Spacer } from './ui';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * The last line of defence: a render-time throw anywhere below lands here
 * instead of a white screen. Recovery is a state reset — the navigation tree
 * remounts from the root, which is the closest thing to an app restart that
 * does not require the user to swipe the app away.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    if (__DEV__) console.error('[boundary]', error);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <View style={styles.screen}>
        <Text style={styles.title}>Something broke</Text>
        <Spacer h={space.sm} />
        <Text style={styles.body}>
          Not your fault. Your progress is saved on the server — restart and
          pick up where you left off.
        </Text>
        <Spacer h={space.xl} />
        <Button label="Restart" onPress={() => this.setState({ error: null })} />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xxl,
  },
  title: { fontFamily: fonts.serif, fontSize: 27, color: colors.ink },
  body: {
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: 22,
    color: colors.inkSoft,
    textAlign: 'center',
    maxWidth: 300,
  },
});
