import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '../lib/supabase';
import type {
  FinishSessionResult,
  PlayableOption,
  PlayableQuestion,
  QuizMode,
  SubmitAnswerResult,
} from '../lib/database.types';

// These moved to lib/database.types so the Arcade lane can produce the same
// shape from next_question(). Re-exported because the Focus player and its
// components already import them from here.
export type { PlayableOption, PlayableQuestion };

export interface PlayableSession {
  id: string;
  mode: QuizMode;
  timeLimitS: number | null;
  questions: PlayableQuestion[];
}

/**
 * Starts a session server-side. The database picks the questions and locks
 * the set, so the client cannot widen it later.
 */
export function useStartSession() {
  return useMutation({
    mutationFn: async (input: {
      mode: QuizMode;
      categoryId?: string | null;
      questionCount?: number;
    }): Promise<string> => {
      const { data, error } = await supabase.rpc('start_quiz_session', {
        p_mode: input.mode,
        p_category_id: input.categoryId ?? null,
        p_question_count: input.questionCount ?? 10,
      });
      if (error) throw error;
      return data as unknown as string;
    },
  });
}

/**
 * Pulls the whole session in one request, including which option is correct.
 *
 * Shipping the answer to the device is deliberate: it is what makes feedback
 * instant and lets a quiz survive a dropped connection mid-session. It costs
 * nothing, because submit_answer() re-derives correctness server-side before
 * it awards anything.
 */
export function useSession(sessionId: string | undefined) {
  return useQuery({
    queryKey: ['session', sessionId],
    enabled: Boolean(sessionId),
    // A session's contents never change once created.
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    queryFn: async (): Promise<PlayableSession> => {
      const { data: session, error: sessionError } = await supabase
        .from('quiz_sessions')
        .select('id, mode, time_limit_s')
        .eq('id', sessionId!)
        .single();
      if (sessionError) throw sessionError;

      const { data, error } = await supabase
        .from('session_questions')
        .select(
          `position,
           questions!inner (
             id, body, code_snippet, code_language, difficulty, kind, explanation,
             options ( id, body, is_correct, sort_order )
           )`,
        )
        .eq('session_id', sessionId!)
        .order('position');
      if (error) throw error;

      const questions: PlayableQuestion[] = (data ?? []).map((row: any) => ({
        id: row.questions.id,
        position: row.position,
        body: row.questions.body,
        code_snippet: row.questions.code_snippet,
        code_language: row.questions.code_language,
        difficulty: row.questions.difficulty,
        kind: row.questions.kind,
        explanation: row.questions.explanation,
        options: [...(row.questions.options ?? [])].sort(
          (a: PlayableOption, b: PlayableOption) => a.sort_order - b.sort_order,
        ),
      }));

      return {
        id: session.id,
        mode: session.mode,
        timeLimitS: session.time_limit_s,
        questions,
      };
    },
  });
}

export function useSubmitAnswer() {
  return useMutation({
    mutationFn: async (input: {
      sessionId: string;
      questionId: string;
      optionId: string | null;
      timeMs: number;
      /** Formats that are not a single choice. Null for everything today. */
      payload?: Record<string, unknown> | null;
    }): Promise<SubmitAnswerResult> => {
      const { data, error } = await supabase.rpc('submit_answer', {
        p_session_id: input.sessionId,
        p_question_id: input.questionId,
        p_option_id: input.optionId,
        p_time_ms: Math.max(0, Math.round(input.timeMs)),
        p_response: input.payload ?? null,
      });
      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : (data as unknown as SubmitAnswerResult);
      if (!row) throw new Error('submit_answer returned no rows');
      return row;
    },
  });
}

export function useFinishSession() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string): Promise<FinishSessionResult> => {
      const { data, error } = await supabase.rpc('finish_quiz_session', {
        p_session_id: sessionId,
      });
      if (error) throw error;

      const row = Array.isArray(data)
        ? data[0]
        : (data as unknown as FinishSessionResult);
      if (!row) throw new Error('finish_quiz_session returned no rows');
      return row;
    },
    onSuccess: () => {
      // XP, level, streak, league standing and badges all just moved.
      qc.invalidateQueries({ queryKey: ['profile'] });
      qc.invalidateQueries({ queryKey: ['league'] });
      qc.invalidateQueries({ queryKey: ['achievements'] });
      qc.invalidateQueries({ queryKey: ['history'] });
    },
  });
}

export function useReportQuestion() {
  return useMutation({
    mutationFn: async (input: {
      questionId: string;
      userId: string;
      reason: 'wrong_answer' | 'unclear' | 'typo' | 'outdated' | 'duplicate' | 'other';
      detail?: string;
    }) => {
      const { error } = await supabase.from('reports').insert({
        question_id: input.questionId,
        user_id: input.userId,
        reason: input.reason,
        detail: input.detail ?? null,
      });
      if (error) throw error;
    },
  });
}
