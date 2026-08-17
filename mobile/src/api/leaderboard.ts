import { useQuery } from '@tanstack/react-query';

import { supabase } from '../lib/supabase';

export interface LeaderboardRow {
  userId: string;
  name: string;
  /** Average quiz score, rounded percentage. */
  score: number;
  quizzes: number;
  rank: number;
  isMe: boolean;
}

/**
 * Ranked by average quiz score via the get_leaderboard() RPC — top 50 plus
 * the caller's own row. Weekly by default, all-time on request.
 */
export function useLeaderboard(allTime: boolean) {
  return useQuery({
    queryKey: ['leaderboard', allTime],
    staleTime: 60 * 1000,
    queryFn: async (): Promise<LeaderboardRow[]> => {
      const { data, error } = await supabase.rpc('get_leaderboard', {
        p_all_time: allTime,
      });
      if (error) throw error;

      return ((data ?? []) as any[]).map((row) => ({
        userId: row.user_id,
        name: row.display_name,
        score: Number(row.avg_score),
        quizzes: Number(row.quizzes),
        rank: Number(row.rank),
        isMe: Boolean(row.is_me),
      }));
    },
  });
}
