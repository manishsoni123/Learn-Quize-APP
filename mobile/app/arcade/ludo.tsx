/**
 * A Ludo match.
 *
 * The turn is a small state machine, and naming its phases is what keeps this
 * screen readable:
 *
 *   question → you are being asked something
 *   move     → you answered correctly, the die is in hand, pick a token
 *   waiting  → the bots are playing
 *   over     → someone won
 *
 * Everything that decides anything happens on the server. This screen asks for
 * a question, sends an answer, sends a token index, and draws whatever comes
 * back — the die included.
 */

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { useNextQuestion } from '../../src/api/arcade';
import { useLudoMove, useMatch } from '../../src/api/ludo';
import { useFinishSession, useSubmitAnswer } from '../../src/api/player';
import { ArcadeButton, ArcadeScreen } from '../../src/components/arcade';
import { Die, LudoBoard, LudoToken, SeatBar } from '../../src/components/ludo';
import { QuestionRenderer, arcadePalette } from '../../src/components/questions';
import { Loading } from '../../src/components/ui';
import type { AnswerResponse, PlayableQuestion } from '../../src/lib/database.types';
import {
  GRID,
  legalMoves,
  type LudoState,
  type Seat,
} from '../../src/lib/ludoBoard';
import { arcade, arcadeType, radius, space } from '../../src/theme/arcade';

type Phase = 'question' | 'move' | 'waiting' | 'over';

export default function LudoMatch() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const match = useMatch(sessionId);
  const nextQuestion = useNextQuestion();
  const submitAnswer = useSubmitAnswer();
  const ludoMove = useLudoMove();
  const finishSession = useFinishSession();

  const [state, setState] = useState<LudoState | null>(null);
  const [question, setQuestion] = useState<PlayableQuestion | null>(null);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [correctId, setCorrectId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('waiting');
  const [notice, setNotice] = useState<string | null>(null);

  const askedAt = useRef(Date.now());
  const ending = useRef(false);

  // The board is square and wants to breathe; the question sits under it.
  const boardSize = Math.min(width - space.lg * 2, 380);
  const cell = boardSize / GRID;

  useEffect(() => {
    if (match.data && !state) {
      setState(match.data);
      setPhase(match.data.winner !== null ? 'over' : 'question');
    }
  }, [match.data, state]);

  const roll = state?.pending_roll ?? null;

  const moves = useMemo(
    () => (state && roll ? legalMoves(state, 0, roll) : []),
    [state, roll],
  );

  /* ------------------------------------------------------------- finish */

  const finish = useCallback(async () => {
    if (ending.current || !sessionId) return;
    ending.current = true;
    try {
      const result = await finishSession.mutateAsync(sessionId);
      router.replace({
        pathname: '/arcade/results',
        params: { mode: 'ludo', payload: JSON.stringify(result) },
      });
    } catch {
      ending.current = false;
      Alert.alert('Could not save the match', 'Check your connection and try again.');
    }
  }, [finishSession, router, sessionId]);

  /* ------------------------------------------------------------ a turn */

  const ask = useCallback(async () => {
    if (!sessionId) return;
    setChosenId(null);
    setRevealed(false);
    setCorrectId(null);

    try {
      const q = await nextQuestion.mutateAsync(sessionId);
      if (!q) {
        // The bank ran dry mid-match. start_ludo_match guards against this,
        // but a category can be retired underneath a resumed game.
        setNotice('No questions left in this category.');
        void finish();
        return;
      }
      setQuestion(q);
      setPhase('question');
      askedAt.current = Date.now();
    } catch {
      setNotice('Could not load the next question.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, finish]);

  useEffect(() => {
    if (phase === 'question' && !question) void ask();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, question]);

  async function answer(response: AnswerResponse) {
    if (revealed || !question || !sessionId) return;

    const right =
      question.options.find((o) => o.id === response.optionId)?.is_correct ?? false;

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
        timeMs: Date.now() - askedAt.current,
      });
      setCorrectId(result.correct_option_id);

      const rolled = (result.run_state as { pending_roll?: number } | null)?.pending_roll;

      if (rolled) {
        setState((s) => (s ? { ...s, pending_roll: rolled } : s));
        setQuestion(null);
        setPhase('move');
        setNotice(null);
      } else {
        // Wrong, or three sixes in a row. Either way the turn is spent.
        setNotice(right ? 'Three sixes — turn forfeited.' : null);
        setTimeout(() => void pass(), right ? 900 : 1500);
      }
    } catch {
      setTimeout(() => void pass(), 900);
    }
  }

  async function pass() {
    await takeTurn(null);
  }

  async function takeTurn(token: number | null) {
    if (!sessionId) return;
    setPhase('waiting');
    setQuestion(null);

    try {
      const turn = await ludoMove.mutateAsync({ sessionId, token });
      setState(turn.state);

      if (turn.state.winner !== null) {
        setPhase('over');
        return;
      }
      setPhase('question');
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'That move was refused.');
      setPhase('question');
    }
  }

  function quit() {
    Alert.alert('Leave this match?', 'It will be waiting when you come back.', [
      { text: 'Keep playing', style: 'cancel' },
      { text: 'Leave', onPress: () => router.replace('/arcade') },
    ]);
  }

  /* ------------------------------------------------------------- render */

  if (!state) {
    return (
      <ArcadeScreen>
        <View style={styles.center}>
          <Loading label="Setting up the board" />
        </View>
      </ArcadeScreen>
    );
  }

  const wasRight = revealed && correctId !== null && chosenId === correctId;

  return (
    <ArcadeScreen>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Leave match" onPress={quit} hitSlop={12}>
          <Ionicons name="close" size={24} color={arcade.inkSoft} />
        </Pressable>
        <Text style={styles.kicker}>LUDO</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <SeatBar players={state.players} turn={state.turn} winner={state.winner} />

        {/* ---------------------------------------------------------- board */}
        <View style={[styles.boardWrap, { width: boardSize, height: boardSize }]}>
          <LudoBoard size={boardSize} />
          {state.players.flatMap((player) =>
            player.tokens.map((pos, i) => {
              const movable =
                phase === 'move' &&
                player.seat === 0 &&
                moves.some((m) => m.token === i);

              return (
                <LudoToken
                  key={`${player.seat}-${i}`}
                  seat={player.seat as Seat}
                  index={i}
                  pos={pos}
                  cell={cell}
                  selectable={movable}
                  onPress={() => void takeTurn(i)}
                />
              );
            }),
          )}
        </View>

        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        {/* --------------------------------------------------------- prompt */}
        {phase === 'move' ? (
          <View style={styles.rolled}>
            <Die value={roll} />
            <View style={styles.flex}>
              <Text style={styles.rolledLabel}>YOU ROLLED</Text>
              <Text style={styles.rolledHint}>
                {moves.length > 0
                  ? 'Tap a glowing token to move it'
                  : `Nothing can use a ${roll}`}
              </Text>
            </View>
            {moves.length === 0 ? (
              <View style={styles.passBtn}>
                <ArcadeButton label="PASS" tone="ghost" onPress={() => void pass()} />
              </View>
            ) : null}
          </View>
        ) : null}

        {phase === 'waiting' ? (
          <View style={styles.waiting}>
            <Text style={styles.waitingText}>Opponents are playing…</Text>
          </View>
        ) : null}

        {phase === 'over' ? (
          <View style={styles.over}>
            <Text style={arcadeType.score}>
              {state.winner === 0 ? 'You won' : 'You lost'}
            </Text>
            <ArcadeButton label="SEE RESULTS" onPress={() => void finish()} />
          </View>
        ) : null}

        {/* ------------------------------------------------------- question */}
        {phase === 'question' && question ? (
          <View style={styles.question}>
            <Text style={styles.questionLabel}>ANSWER TO ROLL</Text>
            <QuestionRenderer
              question={question}
              palette={arcadePalette}
              revealed={revealed}
              chosenId={chosenId}
              onAnswer={(r) => void answer(r)}
            />
            {revealed && !wasRight ? (
              <Text style={styles.explanation}>{question.explanation}</Text>
            ) : null}
          </View>
        ) : null}

        {phase === 'question' && !question ? (
          <View style={styles.waiting}>
            <Text style={styles.waitingText}>Dealing your question…</Text>
          </View>
        ) : null}
      </ScrollView>
    </ArcadeScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, justifyContent: 'center' },

  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.sm,
  },
  kicker: { color: arcade.energy, fontSize: 11, fontWeight: '800', letterSpacing: 2 },

  body: { padding: space.lg, paddingBottom: space.xxxl, gap: space.lg },

  boardWrap: { alignSelf: 'center', position: 'relative' },

  notice: { color: arcade.hot, fontSize: 13, textAlign: 'center' },

  rolled: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    backgroundColor: arcade.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: arcade.energy,
    padding: space.lg,
  },
  rolledLabel: {
    color: arcade.inkFaint,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  rolledHint: { color: arcade.ink, fontSize: 14, fontWeight: '600', marginTop: 2 },
  passBtn: { minWidth: 96 },

  waiting: { alignItems: 'center', paddingVertical: space.lg },
  waitingText: { color: arcade.inkSoft, fontSize: 14 },

  over: { alignItems: 'center', gap: space.lg, paddingVertical: space.lg },

  question: { gap: space.md },
  questionLabel: {
    color: arcade.energy,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  explanation: { color: arcade.inkSoft, fontSize: 14, lineHeight: 20 },
});
