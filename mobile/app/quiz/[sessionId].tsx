import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  useFinishSession,
  useReportQuestion,
  useSession,
  useSubmitAnswer,
  type PlayableQuestion,
} from '../../src/api/player';
import {
  AnswerOption,
  CodeBlock,
  Fraction,
  SegmentedProgress,
  TimerBar,
  WhyCard,
  type OptionState,
  type SegmentResult,
} from '../../src/components/game';
import { Icon } from '../../src/components/icons';
import { Button, ErrorView, Eyebrow, Loading, Spacer, Txt } from '../../src/components/ui';
import { useAuth } from '../../src/lib/auth';
import { colors, fonts, radius, space } from '../../src/theme';
import { modeLabel } from '../../src/lib/labels';

const KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];

export default function QuizScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const router = useRouter();
  const { userId } = useAuth();

  const session = useSession(sessionId);
  const submitAnswer = useSubmitAnswer();
  const finishSession = useFinishSession();
  const reportQuestion = useReportQuestion();

  const [index, setIndex] = useState(0);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  /** Per-question outcome, drives the segmented progress colours. */
  const [outcomes, setOutcomes] = useState<('correct' | 'wrong')[]>([]);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const questionStartedAt = useRef(Date.now());
  const finishing = useRef(false);

  const questions = session.data?.questions ?? [];
  const question: PlayableQuestion | undefined = questions[index];
  const total = questions.length;
  const timeLimit = session.data?.timeLimitS ?? null;

  /* ---------------------------------------------------------------- finish */

  const finish = useCallback(async () => {
    if (finishing.current || !sessionId) return;
    finishing.current = true;
    try {
      const result = await finishSession.mutateAsync(sessionId);
      router.replace({
        pathname: '/quiz/results',
        params: {
          payload: JSON.stringify(result),
          category: session.data?.categoryName ?? '',
          mode: session.data?.mode ?? '',
        },
      });
    } catch {
      finishing.current = false;
      Alert.alert(
        'Could not save your results',
        'Your answers are recorded. Check your connection and try again.',
      );
    }
  }, [finishSession, router, sessionId, session.data]);

  /* ------------------------------------------------------------ whole-run clock */

  // `finish` changes identity with mutation state; going through a ref keeps
  // the countdown effect from re-running — which would reset the clock.
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  }, [finish]);

  useEffect(() => {
    if (!timeLimit) return;
    setRemaining(timeLimit);

    const startedAt = Date.now();
    const id = setInterval(() => {
      const left = timeLimit - Math.floor((Date.now() - startedAt) / 1000);
      setRemaining(Math.max(left, 0));
      if (left <= 0) {
        clearInterval(id);
        void finishRef.current();
      }
    }, 250);

    return () => clearInterval(id);
  }, [timeLimit]);

  /* ---------------------------------------------------------------- answer */

  async function choose(optionId: string) {
    if (revealed || !question || submitAnswer.isPending) return;

    const elapsed = Date.now() - questionStartedAt.current;
    setSubmitError(null);
    setChosenId(optionId);

    // The reveal waits for the server. Optimistic green ticks over a dead
    // connection would walk the user through ten questions and then score
    // them zero — worse than a moment's spinner.
    try {
      await submitAnswer.mutateAsync({
        sessionId: sessionId!,
        questionId: question.id,
        optionId,
        timeMs: elapsed,
      });
    } catch (e) {
      // 23505 = already answered (a retry raced a slow first attempt): the
      // answer IS recorded, so revealing is correct. Anything else means the
      // answer never landed — put the question back and say so.
      const code = (e as { code?: string } | null)?.code;
      if (code !== '23505') {
        setChosenId(null);
        setSubmitError('That answer did not go through. Check your connection and tap it again.');
        return;
      }
    }

    const correct = question.options.find((o) => o.id === optionId)?.is_correct ?? false;
    setRevealed(true);
    setOutcomes((prev) => [...prev, correct ? 'correct' : 'wrong']);
    void Haptics.notificationAsync(
      correct
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Error,
    );
  }

  function next() {
    if (index + 1 >= total) {
      void finish();
      return;
    }
    setIndex((i) => i + 1);
    setChosenId(null);
    setRevealed(false);
    questionStartedAt.current = Date.now();
  }

  function confirmQuit() {
    Alert.alert('Leave this quiz?', 'Answers you have already given are saved.', [
      { text: 'Keep going', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => void finish() },
    ]);
  }

  // Android hardware back goes through the same confirm as the close button.
  // Letting it pop the screen silently would orphan the session — no results,
  // no streak, no review scheduling.
  const confirmQuitRef = useRef(confirmQuit);
  useEffect(() => {
    confirmQuitRef.current = confirmQuit;
  });
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      confirmQuitRef.current();
      return true;
    });
    return () => sub.remove();
  }, []);

  function report() {
    if (!question || !userId) return;
    Alert.alert('Report this question', 'What is wrong with it?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Wrong answer',
        onPress: () =>
          reportQuestion.mutate({
            questionId: question.id,
            userId,
            reason: 'wrong_answer',
          }),
      },
      {
        text: 'Unclear',
        onPress: () =>
          reportQuestion.mutate({ questionId: question.id, userId, reason: 'unclear' }),
      },
    ]);
  }

  const segments: SegmentResult[] = useMemo(
    () =>
      Array.from({ length: total }, (_, i) => {
        if (i < outcomes.length) return outcomes[i];
        if (i === index) return 'current';
        return 'todo';
      }),
    [total, outcomes, index],
  );

  const optionState = useMemo(
    () =>
      (optionId: string, isCorrect: boolean): OptionState => {
        if (!revealed) return chosenId === optionId ? 'selected' : 'idle';
        if (optionId === chosenId) return isCorrect ? 'correct' : 'wrong';
        return isCorrect ? 'missed' : 'dimmed';
      },
    [revealed, chosenId],
  );

  /* ----------------------------------------------------------------- render */

  if (session.isLoading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <Loading label="Preparing your questions" />
      </SafeAreaView>
    );
  }

  if (session.isError || !question) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <ErrorView
          title="Could not load this quiz"
          detail="Go back and start it again."
          onRetry={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  const wasCorrect =
    revealed && question.options.find((o) => o.id === chosenId)?.is_correct === true;

  const context = [
    session.data?.categoryName ?? 'Mixed',
    modeLabel(session.data?.mode ?? ''),
    question.difficulty,
  ].join(' · ');

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      {/* ------------------------------------------------------------ chrome */}
      <View style={styles.top}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Leave quiz"
          onPress={confirmQuit}
          style={styles.roundButton}
          hitSlop={8}
        >
          <Icon name="close" size={16} color={colors.inkMid} />
        </Pressable>
        <Fraction top={String(index + 1)} bottom={String(total)} size="md" />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Report this question"
          onPress={report}
          style={styles.roundButton}
          hitSlop={8}
        >
          <Icon name="flag" size={15} color={colors.inkMid} />
        </Pressable>
      </View>

      <View style={styles.progressWrap}>
        <SegmentedProgress segments={segments} />
        {timeLimit ? (
          <>
            <Spacer h={space.sm} />
            <TimerBar remaining={remaining ?? timeLimit} total={timeLimit} />
          </>
        ) : null}
      </View>

      {/* ---------------------------------------------------------- question */}
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        <Eyebrow>{context}</Eyebrow>
        <Spacer h={space.sm + 2} />
        <Txt variant="question">{question.body}</Txt>

        {question.code_snippet ? <CodeBlock code={question.code_snippet} /> : null}

        <Spacer h={space.lg + 2} />
        <View style={styles.options}>
          {question.options.map((option, i) => (
            <AnswerOption
              key={option.id}
              label={KEYS[i] ?? String(i + 1)}
              body={option.body}
              state={optionState(option.id, option.is_correct)}
              disabled={revealed || submitAnswer.isPending}
              onPress={() => void choose(option.id)}
            />
          ))}
        </View>

        {submitError ? (
          <>
            <Spacer h={space.md} />
            <Text style={styles.submitError} accessibilityLiveRegion="polite">
              {submitError}
            </Text>
          </>
        ) : null}

        {/* ------------------------------------------------------ explanation */}
        {revealed ? (
          <>
            <Spacer h={space.lg} />
            <WhyCard>{question.explanation}</WhyCard>
          </>
        ) : null}
        {revealed && !wasCorrect ? (
          <>
            <Spacer h={space.sm} />
            <Txt variant="caption" tone="soft">
              This one will come back for review.
            </Txt>
          </>
        ) : null}
      </ScrollView>

      {/* -------------------------------------------------------------- next */}
      {revealed ? (
        <View style={styles.footer}>
          <Button
            label={index + 1 >= total ? 'See your score' : 'Next question'}
            onPress={next}
            loading={finishSession.isPending}
          />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    paddingTop: space.md,
  },
  roundButton: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },

  progressWrap: { paddingHorizontal: space.xl, paddingTop: space.md },

  body: { paddingHorizontal: space.xl, paddingTop: space.xl, paddingBottom: space.xxxl },
  options: { gap: space.md - 2 },

  footer: {
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },

  submitError: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: colors.wrongInk,
    textAlign: 'center',
  },
});
