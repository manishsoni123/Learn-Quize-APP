import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
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
  DifficultyPill,
  QuestionProgress,
  TimerBar,
  type OptionState,
} from '../../src/components/game';
import { Button, ErrorView, Loading, Spacer, Txt } from '../../src/components/ui';
import { useAuth } from '../../src/lib/auth';
import { colors, radius, space } from '../../src/theme';

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
  const [xpForQuestion, setXpForQuestion] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);

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
        params: { payload: JSON.stringify(result) },
      });
    } catch {
      finishing.current = false;
      Alert.alert(
        'Could not save your results',
        'Your answers are recorded. Check your connection and try again.',
      );
    }
  }, [finishSession, router, sessionId]);

  /* ------------------------------------------------------------ whole-run clock */

  useEffect(() => {
    if (!timeLimit) return;
    setRemaining(timeLimit);

    const startedAt = Date.now();
    const id = setInterval(() => {
      const left = timeLimit - Math.floor((Date.now() - startedAt) / 1000);
      setRemaining(Math.max(left, 0));
      if (left <= 0) {
        clearInterval(id);
        void finish();
      }
    }, 250);

    return () => clearInterval(id);
  }, [timeLimit, finish]);

  /* ---------------------------------------------------------------- answer */

  async function choose(optionId: string) {
    if (revealed || !question) return;

    const elapsed = Date.now() - questionStartedAt.current;
    const correct = question.options.find((o) => o.id === optionId)?.is_correct ?? false;

    // Feedback lands immediately; the network call catches up behind it. The
    // server is still the authority on XP — this only drives the colours.
    setChosenId(optionId);
    setRevealed(true);
    void Haptics.notificationAsync(
      correct
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Error,
    );

    try {
      const result = await submitAnswer.mutateAsync({
        sessionId: sessionId!,
        questionId: question.id,
        optionId,
        timeMs: elapsed,
      });
      setXpForQuestion(result.xp_awarded);
    } catch {
      // Already answered, or offline. Neither is worth interrupting the run
      // for — the results screen reads the authoritative totals.
      setXpForQuestion(0);
    }
  }

  function next() {
    if (index + 1 >= total) {
      void finish();
      return;
    }
    setIndex((i) => i + 1);
    setChosenId(null);
    setRevealed(false);
    setXpForQuestion(0);
    questionStartedAt.current = Date.now();
  }

  function confirmQuit() {
    Alert.alert('Leave this quiz?', 'Answers you have already given are saved.', [
      { text: 'Keep going', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => void finish() },
    ]);
  }

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

  const optionState = useMemo(
    () =>
      (optionId: string, isCorrect: boolean): OptionState => {
        if (!revealed) return chosenId === optionId ? 'selected' : 'idle';
        if (optionId === chosenId) return isCorrect ? 'correct' : 'wrong';
        return isCorrect ? 'missed' : 'idle';
      },
    [revealed, chosenId],
  );

  /* ----------------------------------------------------------------- render */

  if (session.isLoading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <Loading label="Building your set" />
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

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      {/* ------------------------------------------------------------ chrome */}
      <View style={styles.top}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Leave quiz"
          onPress={confirmQuit}
          hitSlop={12}
        >
          <Ionicons name="close" size={24} color={colors.inkSoft} />
        </Pressable>
        <View style={styles.flex}>
          <QuestionProgress index={index} total={total} />
        </View>
        <Txt variant="caption" tone="faint">
          {index + 1}/{total}
        </Txt>
      </View>

      {timeLimit ? (
        <View style={styles.timerWrap}>
          <TimerBar remaining={remaining ?? timeLimit} total={timeLimit} />
        </View>
      ) : null}

      {/* ---------------------------------------------------------- question */}
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.questionMeta}>
          <DifficultyPill difficulty={question.difficulty} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Report this question"
            onPress={report}
            hitSlop={10}
          >
            <Ionicons name="flag-outline" size={16} color={colors.inkFaint} />
          </Pressable>
        </View>

        <Spacer h={space.md} />
        <Txt variant="heading">{question.body}</Txt>

        {question.code_snippet ? (
          <CodeBlock code={question.code_snippet} language={question.code_language} />
        ) : null}

        <Spacer h={space.xl} />
        <View style={styles.options}>
          {question.options.map((option, i) => (
            <AnswerOption
              key={option.id}
              label={KEYS[i] ?? String(i + 1)}
              body={option.body}
              state={optionState(option.id, option.is_correct)}
              disabled={revealed}
              onPress={() => void choose(option.id)}
            />
          ))}
        </View>

        {/* ------------------------------------------------------ explanation */}
        {revealed ? (
          <>
            <Spacer h={space.xl} />
            <View
              style={[
                styles.explain,
                { borderColor: wasCorrect ? colors.correct : colors.wrong },
              ]}
            >
              <View style={styles.explainHead}>
                <Txt variant="bodyStrong" tone={wasCorrect ? 'accent' : 'wrong'}>
                  {wasCorrect ? 'Correct' : 'Not quite'}
                </Txt>
                {xpForQuestion > 0 ? (
                  <Txt variant="bodyStrong" tone="accent">
                    +{xpForQuestion} XP
                  </Txt>
                ) : null}
              </View>
              <Spacer h={space.sm} />
              <Txt variant="small" tone="soft">
                {question.explanation}
              </Txt>
            </View>
          </>
        ) : null}
      </ScrollView>

      {/* -------------------------------------------------------------- next */}
      {revealed ? (
        <View style={styles.footer}>
          <Button
            label={index + 1 >= total ? 'See results' : 'Next question'}
            onPress={next}
            loading={finishSession.isPending}
          />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.bg },

  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  timerWrap: { paddingHorizontal: space.lg, paddingBottom: space.sm },

  body: { padding: space.lg, paddingBottom: space.xxxl },
  questionMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  options: { gap: space.md },

  explain: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderLeftWidth: 3,
    borderWidth: 1,
    borderTopColor: colors.line,
    borderRightColor: colors.line,
    borderBottomColor: colors.line,
    padding: space.lg,
  },
  explainHead: { flexDirection: 'row', justifyContent: 'space-between' },

  footer: {
    padding: space.lg,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
  },
});
