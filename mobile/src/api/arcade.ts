/**
 * The Arcade data layer.
 *
 * The one real difference from src/api/player.ts: Focus fetches its whole
 * question set once and plays offline from there, Arcade pulls one question at
 * a time from next_question(). That is not a style choice — Survival has no
 * fixed length to fetch, and streaming is what lets the server pick each
 * question knowing how the run is going.
 *
 * The cost is that Arcade needs a connection for every question. That is the
 * right trade for a mode built on a clock and a leaderboard, and the wrong one
 * for studying on a train, which is exactly why both lanes exist.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '../lib/supabase';
import type {
  GameMode,
  PlayableQuestion,
  SubmitAnswerResult,
} from '../lib/database.types';

/** Arcade modes, in display order. Level-gated modes are filtered by the UI. */
export function useGameModes() {
  return useQuery({
    queryKey: ['game-modes'],
    // The catalogue changes when someone tunes a mode, which is a deploy-scale
    // event rather than a per-minute one.
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<GameMode[]> => {
      const { data, error } = await supabase
        .from('game_modes')
        .select('id, slug, name, tagline, lane, rules, accent_hex, icon, min_level, sort_order')
        .eq('lane', 'arcade')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return (data ?? []) as GameMode[];
    },
  });
}

export function useStartRun() {
  return useMutation({
    mutationFn: async (input: {
      modeSlug: string;
      categoryId?: string | null;
    }): Promise<string> => {
      const { data, error } = await supabase.rpc('start_arcade_run', {
        p_mode_slug: input.modeSlug,
        p_category_id: input.categoryId ?? null,
      });
      if (error) throw error;
      return data as unknown as string;
    },
  });
}

/**
 * Pulls the next question of a run.
 *
 * A mutation rather than a query because it genuinely changes server state:
 * the question is appended to session_questions, which is what later makes
 * answering it legal. Calling it twice serves two questions.
 *
 * Returns null when the bank is exhausted — not an error. The run simply ends
 * and the caller shows results.
 */
export function useNextQuestion() {
  return useMutation({
    mutationFn: async (sessionId: string): Promise<PlayableQuestion | null> => {
      const { data, error } = await supabase.rpc('next_question', {
        p_session_id: sessionId,
      });
      if (error) throw error;
      return (data as unknown as PlayableQuestion | null) ?? null;
    },
  });
}

export function useBankLadder() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string): Promise<{ banked: number; rung: number }> => {
      const { data, error } = await supabase.rpc('bank_ladder', {
        p_session_id: sessionId,
      });
      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : (data as { banked: number; rung: number });
      if (!row) throw new Error('bank_ladder returned no rows');
      return row;
    },
    onSuccess: () => {
      // XP just moved, which changes the level bar and the league standing.
      qc.invalidateQueries({ queryKey: ['profile'] });
      qc.invalidateQueries({ queryKey: ['league'] });
    },
  });
}

/** This week's personal best per mode, keyed by slug for the picker. */
export function useMyRecords(userId: string | null) {
  return useQuery({
    queryKey: ['my-records', userId],
    enabled: Boolean(userId),
    staleTime: 30 * 1000,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from('mode_records')
        .select('mode_slug, best_value')
        .eq('user_id', userId!)
        .eq('week_start', startOfWeek());
      if (error) throw error;

      const out: Record<string, number> = {};
      for (const row of data ?? []) out[row.mode_slug] = row.best_value;
      return out;
    },
  });
}

export interface BoardRow {
  user_id: string;
  best_value: number;
  runs: number;
  display_name: string | null;
  username: string | null;
}

/**
 * This week's board for one mode.
 *
 * Weekly rather than all-time on purpose: an all-time board is won once and
 * then belongs to whoever got there first, which tells everyone else the
 * competition is over. A week is short enough that a good run this evening
 * still matters.
 */
export function useModeBoard(modeSlug: string | undefined, limit = 20) {
  return useQuery({
    queryKey: ['mode-board', modeSlug],
    enabled: Boolean(modeSlug),
    staleTime: 60 * 1000,
    queryFn: async (): Promise<BoardRow[]> => {
      const monday = startOfWeek();

      const { data, error } = await supabase
        .from('mode_records')
        .select('user_id, best_value, runs, profiles!inner (display_name, username)')
        .eq('mode_slug', modeSlug!)
        .eq('week_start', monday)
        .order('best_value', { ascending: false })
        .limit(limit);
      if (error) throw error;

      return (data ?? []).map((row: any) => ({
        user_id: row.user_id,
        best_value: row.best_value,
        runs: row.runs,
        display_name: row.profiles?.display_name ?? null,
        username: row.profiles?.username ?? null,
      }));
    },
  });
}

/**
 * Monday of the current week, as a date string.
 *
 * Must agree with `date_trunc('week', now())` in record_run(), which is ISO —
 * weeks start Monday. JavaScript's getDay() calls Sunday 0, so Sunday has to
 * map back six days rather than forward one, and getting that wrong empties
 * the board every Sunday.
 */
function startOfWeek(): string {
  const now = new Date();
  const day = now.getDay();
  const backToMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - backToMonday);

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
}

export type { SubmitAnswerResult };
