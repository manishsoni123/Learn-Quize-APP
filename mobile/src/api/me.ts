import { useQuery } from '@tanstack/react-query';

import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/database.types';

export function useProfile(userId: string | null) {
  return useQuery({
    queryKey: ['profile', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Profile> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export interface HistoryEntry {
  id: string;
  mode: string;
  correct: number;
  total: number;
  xp: number;
  finishedAt: string;
  categoryName: string | null;
}

export function useHistory(userId: string | null, limit = 20) {
  return useQuery({
    queryKey: ['history', userId, limit],
    enabled: Boolean(userId),
    queryFn: async (): Promise<HistoryEntry[]> => {
      const { data, error } = await supabase
        .from('quiz_sessions')
        .select(
          'id, mode, correct_count, answered_count, xp_earned, finished_at, categories ( name )',
        )
        .not('finished_at', 'is', null)
        .order('finished_at', { ascending: false })
        .limit(limit);
      if (error) throw error;

      return (data ?? []).map((s: any) => ({
        id: s.id,
        mode: s.mode,
        correct: s.correct_count,
        total: s.answered_count,
        xp: s.xp_earned,
        finishedAt: s.finished_at,
        categoryName: s.categories?.name ?? null,
      }));
    },
  });
}

/** How many questions are queued for spaced review today. Drives Review. */
export function useDueCount(userId: string | null) {
  return useQuery({
    queryKey: ['due', userId],
    enabled: Boolean(userId),
    staleTime: 60 * 1000,
    queryFn: async (): Promise<number> => {
      const today = new Date().toISOString().slice(0, 10);
      const { count, error } = await supabase
        .from('user_question_stats')
        .select('question_id', { count: 'exact', head: true })
        .lte('next_review_on', today);
      if (error) throw error;
      return count ?? 0;
    },
  });
}
