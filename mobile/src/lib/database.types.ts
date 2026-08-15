/**
 * Domain types for the schema in ../../supabase/migrations.
 *
 * These describe the rows the app actually reads, and every exported function
 * in src/api declares its return type in terms of them — so the boundary
 * between the app and the database is fully typed even though the Supabase
 * client itself is not generically parameterised.
 *
 * The client is deliberately untyped for now. Supabase's generic `Database`
 * type includes the full foreign-key relationship graph, which drives typing
 * for embedded selects like `questions!inner(...)`. Hand-maintaining that graph
 * rots the moment someone adds a column. Once you have a linked project,
 * generate the real thing and pass it to createClient:
 *
 *   npx supabase gen types typescript --linked > src/lib/database.generated.ts
 *
 * then `createClient<Database>(...)` in ./supabase.ts. Nothing else has to
 * change — these interfaces stay useful as the app's own vocabulary.
 */

export type Difficulty = 'easy' | 'medium' | 'hard';
export type QuestionKind = 'single_choice' | 'true_false' | 'code_output';
export type ContentStatus = 'draft' | 'in_review' | 'approved' | 'rejected' | 'retired';
export type QuizMode =
  | 'practice'
  | 'timed_test'
  | 'rapid_fire'
  | 'daily_challenge'
  | 'weak_spots';
export type LeagueTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';
export type ReportReason =
  | 'wrong_answer'
  | 'unclear'
  | 'typo'
  | 'outdated'
  | 'duplicate'
  | 'other';

export interface Track {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  accent_hex: string;
  sort_order: number;
  is_active: boolean;
}

export interface Category {
  id: string;
  track_id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
  approved_question_count: number;
}

export interface Question {
  id: string;
  category_id: string;
  kind: QuestionKind;
  difficulty: Difficulty;
  status: ContentStatus;
  body: string;
  code_snippet: string | null;
  code_language: string | null;
  explanation: string;
  tags: string[];
}

export interface QuestionOption {
  id: string;
  question_id: string;
  body: string;
  is_correct: boolean;
  sort_order: number;
}

export interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  xp: number;
  level: number;
  current_streak: number;
  longest_streak: number;
  streak_freezes: number;
  last_active_on: string | null;
  primary_track_id: string | null;
  daily_goal_xp: number;
  timezone: string;
  is_staff: boolean;
}

export interface Achievement {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string | null;
  xp_reward: number;
  sort_order: number;
}

/** Return shape of public.submit_answer(). */
export interface SubmitAnswerResult {
  is_correct: boolean;
  correct_option_id: string | null;
  xp_awarded: number;
  explanation: string;
}

/** Return shape of public.finish_quiz_session(). */
export interface FinishSessionResult {
  correct_count: number;
  answered_count: number;
  question_count: number;
  xp_earned: number;
  new_level: number;
  new_streak: number;
  unlocked: string[];
}
