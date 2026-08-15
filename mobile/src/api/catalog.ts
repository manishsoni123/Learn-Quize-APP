import { useQuery } from '@tanstack/react-query';

import { supabase } from '../lib/supabase';
import type { Category, Track } from '../lib/database.types';

export interface TrackWithCategories extends Track {
  categories: Category[];
}

/**
 * The home screen's entire dataset in one round trip. RLS already hides
 * inactive rows, but the filters keep the payload small and make the intent
 * obvious at the call site.
 */
export function useCatalog() {
  return useQuery({
    queryKey: ['catalog'],
    // The catalogue changes when someone flips a category live, which is a
    // deploy-scale event, not a per-minute one.
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<TrackWithCategories[]> => {
      const [tracksRes, categoriesRes] = await Promise.all([
        supabase
          .from('tracks')
          .select('*')
          .eq('is_active', true)
          .order('sort_order'),
        supabase
          .from('categories')
          .select('*')
          .eq('is_active', true)
          .order('sort_order'),
      ]);

      if (tracksRes.error) throw tracksRes.error;
      if (categoriesRes.error) throw categoriesRes.error;

      const byTrack = new Map<string, Category[]>();
      for (const c of categoriesRes.data ?? []) {
        const list = byTrack.get(c.track_id) ?? [];
        list.push(c);
        byTrack.set(c.track_id, list);
      }

      return (tracksRes.data ?? [])
        .map((t) => ({ ...t, categories: byTrack.get(t.id) ?? [] }))
        // A track whose categories are all still dark would render as an
        // empty heading.
        .filter((t) => t.categories.length > 0);
    },
  });
}

export function useCategory(slug: string | undefined) {
  return useQuery({
    queryKey: ['category', slug],
    enabled: Boolean(slug),
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<{ category: Category; track: Track }> => {
      const { data: category, error } = await supabase
        .from('categories')
        .select('*')
        .eq('slug', slug!)
        .single();
      if (error) throw error;

      const { data: track, error: trackError } = await supabase
        .from('tracks')
        .select('*')
        .eq('id', category.track_id)
        .single();
      if (trackError) throw trackError;

      return { category, track };
    },
  });
}
