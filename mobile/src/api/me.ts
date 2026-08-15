import { useQuery } from '@tanstack/react-query';

import { supabase } from '../lib/supabase';
import type { Achievement, LeagueTier, Profile } from '../lib/database.types';

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

export interface AchievementState extends Achievement {
  earnedAt: string | null;
}

export function useAchievements(userId: string | null) {
  return useQuery({
    queryKey: ['achievements', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<AchievementState[]> => {
      const [all, mine] = await Promise.all([
        supabase.from('achievements').select('*').order('sort_order'),
        supabase.from('user_achievements').select('achievement_id, earned_at'),
      ]);
      if (all.error) throw all.error;
      if (mine.error) throw mine.error;

      const earned = new Map(
        (mine.data ?? []).map((r) => [r.achievement_id, r.earned_at]),
      );

      return (all.data ?? []).map((a) => ({
        ...a,
        earnedAt: earned.get(a.id) ?? null,
      }));
    },
  });
}

export interface LeagueStanding {
  tier: LeagueTier;
  weekStart: string;
  rows: {
    userId: string;
    displayName: string;
    avatarUrl: string | null;
    xp: number;
    rank: number;
    isMe: boolean;
  }[];
  myRank: number | null;
}

/**
 * The user's own league room for this week. RLS restricts visibility to rooms
 * they are a member of, so this cannot be used to scrape a global board.
 */
export function useLeague(userId: string | null) {
  return useQuery({
    queryKey: ['league', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<LeagueStanding | null> => {
      const { data: membership, error: memberError } = await supabase
        .from('league_members')
        .select('league_id, leagues!inner ( id, tier, week_start )')
        .eq('user_id', userId!)
        .order('leagues(week_start)', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (memberError) throw memberError;
      if (!membership) return null;

      const league = (membership as any).leagues;

      const { data: rows, error } = await supabase
        .from('league_members')
        .select('user_id, xp_earned, profiles!inner ( display_name, username, avatar_url )')
        .eq('league_id', league.id)
        .order('xp_earned', { ascending: false });
      if (error) throw error;

      const ranked = (rows ?? []).map((r: any, i) => ({
        userId: r.user_id,
        displayName:
          r.profiles?.display_name ?? r.profiles?.username ?? 'Anonymous',
        avatarUrl: r.profiles?.avatar_url ?? null,
        xp: r.xp_earned,
        rank: i + 1,
        isMe: r.user_id === userId,
      }));

      return {
        tier: league.tier,
        weekStart: league.week_start,
        rows: ranked,
        myRank: ranked.find((r) => r.isMe)?.rank ?? null,
      };
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

/** How many questions are queued for spaced review today. Drives Weak Spots. */
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
