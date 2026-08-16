-- Learn-Quize · 017 · The Ludo mode row
--
-- Separate file because the 'ludo' enum value was added in 20260817090000 and
-- Postgres will not let a new enum value be used in the transaction that
-- created it.

insert into public.game_modes
  (slug, mode, name, tagline, lane, rules, accent_hex, icon, min_level, sort_order)
values
  (
    'ludo', 'ludo',
    'Ludo',
    'Answer right, roll the die. Three rivals.',
    'arcade',
    jsonb_build_object(
      'tokens',   4,
      'defer_xp', false,
      -- A full match asks the human 30-50 questions and a question cannot
      -- repeat within a session, so a ten-question category produces a game
      -- that quietly runs dry halfway through. start_ludo_match refuses rather
      -- than letting that happen. Lower it only when the bank can carry it.
      'min_questions', 30
    ),
    '#E0533F', 'apps', 1, 5
  )
on conflict (slug) do update set
  mode       = excluded.mode,
  name       = excluded.name,
  tagline    = excluded.tagline,
  rules      = excluded.rules,
  accent_hex = excluded.accent_hex,
  icon       = excluded.icon,
  min_level  = excluded.min_level,
  sort_order = excluded.sort_order;
