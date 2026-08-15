/**
 * The Arcade player.
 *
 * Separate from quiz/[sessionId].tsx rather than a variant of it, because the
 * two differ in the thing that structures a player: Focus has its whole set in
 * hand and walks an index through it, Arcade asks the server for one more each
 * time and does not know whether there will be another. Folding both into one
 * component would mean a screen that is half array-walker and half state
 * machine, and every future mode would make that worse.
 *
 * What they do share is the question renderer, which is the part worth sharing.
 */

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';

import { useBankLadder, useGameModes, useNextQuestion } from '../../src/api/arcade';
import { useFinishSession, useSubmitAnswer } from '../../src/api/player';
import {
  ArcadeButton,
  ArcadeScreen,
  BigNumber,
  Hearts,
  LadderRail,
  RunClock,
} from '../../src/components/arcade';
import { QuestionRenderer, arcadePalette } from '../../src/components/questions';
import { Loading } from '../../src/components/ui';
import type {
  AnswerResponse,
  PlayableQuestion,
  RunState,
} from '../../src/lib/database.types';
import { arcade, arcadeType, radius, space } from '../../src/theme/arcade';

/** How long the answer stays on screen before the run moves on. */
const REVEAL_MS = { correct: 700, wrong: 1600 };

export default function ArcadePlayer() {
  const { mode: modeSlug, sessionId } = useLocalSearchParams<{
    mode: string;
    sessionId: string;
  }>();
  const router = useRouter();

  const modes = useGameModes();
  const nextQuestion = useNextQuestion();
  const submitAnswer = useSubmitAnswer();
  const bankLadder = useBankLadder();
  const finishSession = useFinishSession();

  const [question, setQuestion] = useState<PlayableQuestion | null>(null);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [run, setRun] = useState<RunState>({});
  const [xpJustWon, setXpJustWon] = useState(0);
  const [correctId, setCorrectId] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [score, setScore] = useState(0);

  const askedAt = useRef(Date.now());
  const ending = useRef(false);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mode = (modes.data ?? []).find((m) => m.slug === modeSlug);
  const rungs = mode?.rules?.rungs ?? [];
  const maxLives = mode?.rules?.lives ?? 3;
  const durationS = mode?.rules?.duration_s ?? null;

  const isLadder = modeSlug === 'ladder';
  const isSurvival = modeSlug === 'survival';

  /* ------------------------------------------------------------------ end */

  const end = useCallback(async () => {
    if (ending.current || !sessionId) return;
    ending.current = true;
    if (advanceTimer.current) clearTimeout(advanceTimer.current);

    try {
      const result = await finishSession.mutateAsync(sessionId);
      router.replace({
        pathname: '/arcade/results',
        params: { mode: modeSlug, payload: JSON.stringify(result) },
      });
    } catch {
      ending.current = false;
      Alert.alert(
        'Could not save this run',
        'Your answers are recorded. Check your connection and try again.',
      );
    }
  }, [finishSession, router, sessionId, modeSlug]);

  /* ----------------------------------------------------------- next card */

  const pull = useCallback(async () => {
    if (!sessionId || ending.current) return;

    setChosenId(null);
    setRevealed(false);
    setCorrectId(null);
    setXpJustWon(0);

    try {
      const q = await nextQuestion.mutateAsync(sessionId);
      if (!q) {
        // The bank is exhausted. Ending on a full score beats an error.
        void end();
        return;
      }
      setQuestion(q);
      askedAt.current = Date.now();
    } catch {
      void end();
    }
    // nextQuestion identity changes every render; depending on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, end]);

  useEffect(() => {
    void pull();
    // Deliberately once: this kicks off the run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ----------------------------------------------------------- the clock */

  useEffect(() => {
    if (!durationS) return;
    setRemaining(durationS);

    const startedAt = Date.now();
    const id = setInterval(() => {
      const left = durationS - (Date.now() - startedAt) / 1000;
      setRemaining(Math.max(left, 0));
      if (left <= 0) {
        clearInterval(id);
        void end();
      }
    }, 100);

    return () => clearInterval(id);
  }, [durationS, end]);

  useEffect(() => () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
  }, []);

  /* ---------------------------------------------------------------- play */

  async function answer(response: AnswerResponse) {
    if (revealed || !question || !sessionId) return;

    const elapsed = Date.now() - askedAt.current;
    const right =
      question.options.find((o) => o.id === response.optionId)?.is_correct ?? false;

    // Colour and haptics land now; the network catches up behind them. The
    // server is still the authority on everything that counts.
    setChosenId(response.optionId);
    setRevealed(true);
    void Haptics.notificationAsync(
      right
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Error,
    );

    try {
      const result = await submitAnswer.mutateAsync({
        sessionId,
        questionId: question.id,
        optionId: response.optionId,
        timeMs: elapsed,
        payload: response.payload ?? null,
      });

      setCorrectId(result.correct_option_id);
      setXpJustWon(result.xp_awarded);
      if (right) setScore((s) => s + 1);

      const state = result.run_state ?? {};
      setRun(state);

      if (state.run_over) {
        // Let the last answer register before the screen changes — ending
        // instantly reads as a crash rather than a defeat.
        advanceTimer.current = setTimeout(() => void end(), REVEAL_MS.wrong);
        return;
      }

      // Ladder stops here on purpose. The decision is the mode.
      if (isLadder) return;

      advanceTimer.current = setTimeout(
        () => void pull(),
        right ? REVEAL_MS.correct : REVEAL_MS.wrong,
      );
    } catch {
      // Already answered, or offline. Neither is worth ending a run over.
      advanceTimer.current = setTimeout(() => void pull(), REVEAL_MS.correct);
    }
  }

  async function bank() {
    if (!sessionId) return;
    try {
      await bankLadder.mutateAsync(sessionId);
      void end();
    } catch {
      Alert.alert('Could not bank', 'Check your connection and try again.');
    }
  }

  function quit() {
    Alert.alert(
      isLadder && (run.unbanked ?? 0) > 0 ? 'Leave and lose it?' : 'Leave this run?',
      isLadder && (run.unbanked ?? 0) > 0
        ? `${run.unbanked} XP is still riding. Leaving now banks nothing.`
        : 'Answers you have already given are saved.',
      [
        { text: 'Keep playing', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: () => void end() },
      ],
    );
  }

  /* -------------------------------------------------------------- render */

  if (!question) {
    return (
      <ArcadeScreen>
        <View style={styles.center}>
          <Loading label="Dealing you in" />
        </View>
      </ArcadeScreen>
    );
  }

  const wasRight = revealed && correctId !== null && chosenId === correctId;
  const decision = isLadder && revealed && wasRight && !run.run_over;
  const atRisk = run.unbanked ?? 0;
  const nextRung = rungs[(run.rung ?? 0)] ?? null;

  return (
    <ArcadeScreen>
      {/* ------------------------------------------------------------ chrome */}
      <View style={styles.top}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Leave run"
          onPress={quit}
          hitSlop={12}
        >
          <Ionicons name="close" size={24} color={arcade.inkSoft} />
        </Pressable>

        <View style={styles.topMid}>
          {isSurvival ? <Hearts lives={run.lives ?? maxLives} max={maxLives} /> : null}
          {durationS ? <RunClock remaining={remaining ?? durationS} total={durationS} /> : null}
        </View>

        {!isLadder ? (
          <Text style={[arcadeType.meter, { color: arcade.energy }]}>{score}</Text>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {isLadder ? (
          <View style={styles.ladderWrap}>
            <LadderRail rungs={rungs} current={run.rung ?? 0} />
          </View>
        ) : null}

        <QuestionRenderer
          question={question}
          palette={arcadePalette}
          revealed={revealed}
          chosenId={chosenId}
          onAnswer={(r) => void answer(r)}
        />

        {revealed ? (
          <View
            style={[
              styles.verdict,
              { borderColor: wasRight ? arcade.win : arcade.hot },
            ]}
          >
            <View style={styles.verdictHead}>
              <Text
                style={[
                  styles.verdictText,
                  { color: wasRight ? arcade.win : arcade.hot },
                ]}
              >
                {wasRight ? 'CORRECT' : run.run_over ? 'RUN OVER' : 'MISS'}
              </Text>
              {xpJustWon > 0 ? (
                <Text style={styles.verdictXp}>+{xpJustWon} XP</Text>
              ) : null}
            </View>
            {!wasRight ? (
              <Text style={styles.explanation}>{question.explanation}</Text>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      {/* ---------------------------------------------------- bank or risk */}
      {decision ? (
        <View style={styles.decision}>
          <View style={styles.atRisk}>
            <Text style={styles.atRiskLabel}>RIDING ON IT</Text>
            <BigNumber value={atRisk} size="score" />
          </View>
          <View style={styles.decisionRow}>
            <View style={styles.flex}>
              <ArcadeButton
                label="BANK IT"
                sub={`${atRisk} XP`}
                onPress={() => void bank()}
                disabled={bankLadder.isPending}
              />
            </View>
            <View style={styles.flex}>
              <ArcadeButton
                label="RISK IT"
                sub={nextRung ? `for ${nextRung}` : 'final rung'}
                tone="danger"
                onPress={() => void pull()}
              />
            </View>
          </View>
        </View>
      ) : null}
    </ArcadeScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, justifyContent: 'center' },

  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  topMid: { flex: 1 },

  body: { padding: space.lg, paddingBottom: space.xxxl },

  ladderWrap: { marginBottom: space.xl },

  verdict: {
    marginTop: space.xl,
    backgroundColor: arcade.surface,
    borderRadius: radius.md,
    borderLeftWidth: 3,
    borderWidth: 1,
    borderTopColor: arcade.line,
    borderRightColor: arcade.line,
    borderBottomColor: arcade.line,
    padding: space.lg,
  },
  verdictHead: { flexDirection: 'row', justifyContent: 'space-between' },
  verdictText: { fontSize: 13, fontWeight: '800', letterSpacing: 1.2 },
  verdictXp: {
    color: arcade.energy,
    fontSize: 14,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  explanation: {
    color: arcade.inkSoft,
    fontSize: 14,
    lineHeight: 20,
    marginTop: space.sm,
  },

  decision: {
    padding: space.lg,
    borderTopWidth: 1,
    borderTopColor: arcade.line,
    backgroundColor: arcade.surface,
    gap: space.lg,
  },
  atRisk: { alignItems: 'center' },
  atRiskLabel: {
    color: arcade.inkFaint,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 2,
  },
  decisionRow: { flexDirection: 'row', gap: space.md },
});
