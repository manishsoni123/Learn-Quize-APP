/**
 * Ludo data layer.
 *
 * A match is a quiz session, so the question half of a turn reuses
 * src/api/arcade.ts and src/api/player.ts unchanged. Only the board moves are
 * new.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '../lib/supabase';
import type { LudoState } from '../lib/ludoBoard';

/** One entry of the replay a turn returns, so bot moves can be animated. */
export interface LudoLogEntry {
  seat: number;
  roll?: number;
  event: 'move' | 'missed' | 'blocked' | 'three_sixes';
  move?: { token: number; from: number; to: number; capture: { seat: number; token: number } | null };
}

export interface LudoTurn {
  state: LudoState;
  log: LudoLogEntry[];
}

/**
 * The match already in progress, if any.
 *
 * A full game runs long enough that closing the app mid-match is ordinary
 * rather than exceptional, so resuming is the default path and not a feature.
 */
export function useActiveMatch(userId: string | null) {
  return useQuery({
    queryKey: ['ludo-active', userId],
    enabled: Boolean(userId),
    staleTime: 0,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase.rpc('active_ludo_match');
      if (error) throw error;
      return (data as unknown as string | null) ?? null;
    },
  });
}

/** The board as it stands. Read on mount so a resumed match renders correctly. */
export function useMatch(sessionId: string | undefined) {
  return useQuery({
    queryKey: ['ludo-match', sessionId],
    enabled: Boolean(sessionId),
    staleTime: Infinity,
    queryFn: async (): Promise<LudoState> => {
      const { data, error } = await supabase
        .from('quiz_sessions')
        .select('state')
        .eq('id', sessionId!)
        .single();
      if (error) throw error;
      return data.state as LudoState;
    },
  });
}

export function useStartMatch() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (categoryId: string | null): Promise<string> => {
      const { data, error } = await supabase.rpc('start_ludo_match', {
        p_category_id: categoryId,
      });
      if (error) throw error;
      return data as unknown as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ludo-active'] });
    },
  });
}

/**
 * Takes the human's turn and plays every bot behind it.
 *
 * `token` null means "I cannot move" — a wrong answer, three sixes, or a roll
 * with no legal move. All three bots resolve inside this one call, so a turn
 * costs a single round trip rather than four.
 */
export function useLudoMove() {
  return useMutation({
    mutationFn: async (input: {
      sessionId: string;
      token: number | null;
    }): Promise<LudoTurn> => {
      const { data, error } = await supabase.rpc('ludo_move', {
        p_session_id: input.sessionId,
        p_token: input.token,
      });
      if (error) throw error;
      return data as unknown as LudoTurn;
    },
  });
}
