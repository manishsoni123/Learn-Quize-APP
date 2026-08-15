-- Learn-Quize · 007 · Arcade enum values
--
-- Alone in its own file on purpose. Postgres allows ALTER TYPE ... ADD VALUE
-- inside a transaction, but the new value cannot be *used* in that same
-- transaction — so seeding a row with 'ladder' has to happen in a later
-- migration, which is a separate transaction. Merging this into the table
-- migration would fail with "unsafe use of new value of enum type".

alter type public.quiz_mode add value if not exists 'ladder';
alter type public.quiz_mode add value if not exists 'survival';

-- Question *kinds* are not extended here. Slice 1 (Ladder, Survival, Blitz)
-- reuses single_choice and code_output unchanged; the new formats — ordering
-- code lines, spotting a bug, matching pairs — arrive with the admin panel
-- that can author them. questions.payload is added now so that lands without
-- another table migration.
