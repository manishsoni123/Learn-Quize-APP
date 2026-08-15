/**
 * One correct option out of N — every question in the bank today.
 *
 * Lifted verbatim out of quiz/[sessionId].tsx, with the one change that makes
 * it reusable: colour comes from a palette prop instead of a theme import, so
 * the same component renders in mint on the Focus lane and amber on Arcade.
 */

import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { mono } from '../ui';
import { radius, space } from '../../theme';
import type { QuestionViewProps } from './index';

const KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];

type OptionState = 'idle' | 'selected' | 'correct' | 'wrong' | 'missed';

export function ChoiceQuestion({
  question,
  palette,
  revealed,
  chosenId,
  onAnswer,
}: QuestionViewProps) {
  const stateFor = useMemo(
    () =>
      (optionId: string, isCorrect: boolean): OptionState => {
        if (!revealed) return chosenId === optionId ? 'selected' : 'idle';
        if (optionId === chosenId) return isCorrect ? 'correct' : 'wrong';
        return isCorrect ? 'missed' : 'idle';
      },
    [revealed, chosenId],
  );

  return (
    <View>
      <Text style={[styles.body, { color: palette.ink }]}>{question.body}</Text>

      {question.code_snippet ? (
        <View
          style={[
            styles.code,
            { backgroundColor: palette.codeBg, borderColor: palette.line },
          ]}
        >
          {/* Code must never wrap — a broken line changes what the snippet means. */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Text style={[styles.codeText, { color: palette.codeInk }]}>
              {question.code_snippet}
            </Text>
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.options}>
        {question.options.map((option, i) => {
          const state = stateFor(option.id, option.is_correct);
          const skin = {
            idle: { border: palette.line, bg: palette.surface, text: palette.ink },
            selected: {
              border: palette.selected,
              bg: palette.selectedDim,
              text: palette.ink,
            },
            correct: {
              border: palette.correct,
              bg: palette.correctDim,
              text: palette.ink,
            },
            wrong: { border: palette.wrong, bg: palette.wrongDim, text: palette.ink },
            // The right answer, revealed after the player picked something else.
            missed: {
              border: palette.correct,
              bg: 'transparent',
              text: palette.inkSoft,
            },
          }[state];

          return (
            <Pressable
              key={option.id}
              accessibilityRole="button"
              accessibilityState={{ disabled: revealed, selected: state !== 'idle' }}
              disabled={revealed}
              onPress={() => onAnswer({ optionId: option.id })}
              style={({ pressed }) => [
                styles.option,
                { borderColor: skin.border, backgroundColor: skin.bg },
                pressed && !revealed && styles.pressed,
              ]}
            >
              <View style={[styles.key, { borderColor: skin.border }]}>
                <Text style={[styles.keyText, { color: skin.border }]}>
                  {KEYS[i] ?? String(i + 1)}
                </Text>
              </View>
              <Text style={[styles.optionBody, { color: skin.text }]}>{option.body}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.85, transform: [{ scale: 0.995 }] },

  body: { fontSize: 18, lineHeight: 24, fontWeight: '700' },

  code: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space.md,
    marginTop: space.md,
  },
  codeText: { fontFamily: mono, fontSize: 13, lineHeight: 20 },

  options: { gap: space.md, marginTop: space.xl },
  option: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    borderWidth: 1.5,
    borderRadius: radius.md,
    padding: space.lg,
  },
  key: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: { fontSize: 12, fontWeight: '800' },
  optionBody: { flex: 1, fontSize: 15, lineHeight: 22, paddingTop: 2 },
});
