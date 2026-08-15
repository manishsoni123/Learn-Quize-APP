-- Learn-Quize · 002 · Content: tracks, categories, questions, options

-- ============================================================ tracks

create table public.tracks (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text,
  accent_hex  text not null default '#146B57',
  sort_order  smallint not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger tracks_set_updated_at
before update on public.tracks
for each row execute function public.tg_set_updated_at();

-- ============================================================ categories

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  track_id    uuid not null references public.tracks(id) on delete cascade,
  slug        text not null unique,
  name        text not null,
  description text,
  icon        text,
  sort_order  smallint not null default 0,
  is_active   boolean not null default false,

  -- Denormalised counter maintained by a trigger. The home screen renders this
  -- for every category on every open; a count(*) over questions would not hold.
  approved_question_count integer not null default 0,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index categories_track_order_idx on public.categories (track_id, sort_order);

create trigger categories_set_updated_at
before update on public.categories
for each row execute function public.tg_set_updated_at();

-- ============================================================ questions

create table public.questions (
  id            uuid primary key default gen_random_uuid(),
  category_id   uuid not null references public.categories(id) on delete restrict,
  kind          public.question_kind    not null default 'single_choice',
  difficulty    public.difficulty_level not null default 'medium',
  status        public.content_status   not null default 'draft',

  body          text not null,
  code_snippet  text,
  code_language text,
  explanation   text not null,
  tags          text[] not null default '{}',

  -- Provenance. Every row records where it came from, so a licensing question
  -- three years from now is a query rather than an archaeology project.
  source         text not null default 'manual',   -- manual | ai | import:<name>
  source_url     text,
  source_licence text,

  created_by  uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,

  -- Observed difficulty, updated on every answer. Diverging sharply from the
  -- declared difficulty usually means the question is badly worded.
  times_answered integer not null default 0,
  times_correct  integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint questions_body_not_blank
    check (length(btrim(body)) > 0),
  constraint questions_explanation_not_blank
    check (length(btrim(explanation)) > 0),
  constraint questions_approved_has_approver
    check (status <> 'approved' or approved_by is not null)
);

-- The hot path: drawing an approved question set for one category.
create index questions_live_idx
  on public.questions (category_id, difficulty)
  where status = 'approved';

-- The review queue.
create index questions_pending_idx
  on public.questions (category_id, created_at)
  where status in ('draft', 'in_review');

create index questions_tags_idx on public.questions using gin (tags);

create trigger questions_set_updated_at
before update on public.questions
for each row execute function public.tg_set_updated_at();

-- ============================================================ options

create table public.options (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  body        text not null,
  is_correct  boolean not null default false,
  sort_order  smallint not null default 0,
  created_at  timestamptz not null default now()
);

create index options_question_idx on public.options (question_id, sort_order);

-- Exactly one correct option per question, enforced by the database rather
-- than by whoever is writing the import script that day.
create unique index options_single_correct_idx
  on public.options (question_id)
  where is_correct;

-- ============================================================ counter upkeep

create or replace function public.tg_sync_category_question_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'approved' then
      update public.categories
         set approved_question_count = approved_question_count + 1
       where id = new.category_id;
    end if;

  elsif tg_op = 'DELETE' then
    if old.status = 'approved' then
      update public.categories
         set approved_question_count = greatest(approved_question_count - 1, 0)
       where id = old.category_id;
    end if;

  else
    -- UPDATE: status, category, or both may have moved.
    if old.status = 'approved' then
      update public.categories
         set approved_question_count = greatest(approved_question_count - 1, 0)
       where id = old.category_id;
    end if;
    if new.status = 'approved' then
      update public.categories
         set approved_question_count = approved_question_count + 1
       where id = new.category_id;
    end if;
  end if;

  return null;
end;
$$;

create trigger questions_sync_category_count
after insert or delete or update of status, category_id on public.questions
for each row execute function public.tg_sync_category_question_count();
