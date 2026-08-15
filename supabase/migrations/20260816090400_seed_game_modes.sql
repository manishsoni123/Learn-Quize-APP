-- Learn-Quize · 011 · The mode catalogue
--
-- Separate from the table migration because the quiz_mode enum values used
-- here ('ladder', 'survival') were added in 20260816090000, and Postgres will
-- not let a new enum value be used in the transaction that created it.
--
-- These numbers are the ones to tune. They are rows precisely so that tuning
-- them is a row edit from the admin panel rather than a migration.

insert into public.game_modes
  (slug, mode, name, tagline, lane, rules, accent_hex, icon, min_level, sort_order)
values
  (
    'ladder', 'ladder',
    'Ladder',
    'Ten rungs. Bank it or risk it.',
    'arcade',
    jsonb_build_object(
      -- Cumulative payout at each rung, not per-question. The player sees one
      -- number — "bank 130 XP" — and the curve is steep enough at the top that
      -- walking away from rung 8 is a genuinely hard decision, which is the
      -- entire mechanic.
      --
      -- defer_xp is what makes losing hurt: nothing reaches the profile until
      -- bank_ladder() runs, so a bust really does pay zero.
      'rungs',    jsonb_build_array(10, 22, 40, 65, 100, 150, 220, 330, 500, 750),
      'defer_xp', true
    ),
    '#FFB33C', 'trending-up', 1, 10
  ),
  (
    'survival', 'survival',
    'Survival',
    'Three lives. It only gets harder.',
    'arcade',
    jsonb_build_object('lives', 3, 'defer_xp', false),
    '#FF4D6D', 'heart', 1, 20
  ),
  (
    'blitz', 'rapid_fire',
    'Blitz',
    'Sixty seconds. Go.',
    'arcade',
    jsonb_build_object('duration_s', 60, 'defer_xp', false),
    '#5CE1E6', 'flash', 1, 30
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
