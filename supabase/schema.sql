-- =============================================================================
-- Lang Learn — full Supabase schema (v2: multi-language vocabularies)
--
-- Run this whole file in the Supabase SQL editor. It is idempotent: running it
-- again only (re)creates what is missing and replaces functions/policies.
--
-- Upgrading from the v1 schema (vocabulary_entries / progress_state /
-- review_records)? Run this file FIRST, then run
-- supabase/migrations/20260930_001_migrate_v1_data.sql once.
--
-- Design notes
--   * Nothing is ever hard-deleted. Every user-owned table has `deleted_at`;
--     the `authenticated` role has no DELETE/TRUNCATE privilege and there are
--     no DELETE policies, so even a crafted API call cannot remove rows.
--   * Counters (word_count, download_count, rating_avg/count) are maintained
--     by triggers and cannot be written by clients.
--   * A vocabulary can only be published with 50..5000 words. It drops back
--     to draft automatically if deletions take it under 50.
--   * Privileged trigger functions live in the non-exposed `private` schema.
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Languages (only three enabled for now: German, English, Persian)
-- -----------------------------------------------------------------------------
create table if not exists public.languages (
  code        text primary key check (code ~ '^[a-z]{2}$'),
  name        text not null,
  native_name text not null,
  is_rtl      boolean not null default false,
  is_enabled  boolean not null default true,
  sort_order  smallint not null default 0
);

insert into public.languages (code, name, native_name, is_rtl, sort_order) values
  ('de', 'German',  'Deutsch', false, 1),
  ('en', 'English', 'English', false, 2),
  ('fa', 'Persian', 'فارسی',   true,  3)
on conflict (code) do update
  set name = excluded.name,
      native_name = excluded.native_name,
      is_rtl = excluded.is_rtl,
      sort_order = excluded.sort_order;

-- -----------------------------------------------------------------------------
-- Profiles (one per auth user, created automatically on sign-up)
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id               uuid primary key references auth.users (id) on delete restrict,
  display_name     text not null check (char_length(btrim(display_name)) between 1 and 60),
  primary_language text not null default 'fa' references public.languages (code),
  ui_language      text not null default 'fa' check (ui_language in ('fa', 'en')),
  quiz_settings    jsonb not null default '{}'::jsonb check (jsonb_typeof(quiz_settings) = 'object'),
  preferences      jsonb not null default '{}'::jsonb check (jsonb_typeof(preferences) = 'object'),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

-- Added after the first v2 release: appearance and quiz behaviour settings.
alter table public.profiles
  add column if not exists preferences jsonb not null default '{}'::jsonb;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_preferences_object') then
    alter table public.profiles
      add constraint profiles_preferences_object check (jsonb_typeof(preferences) = 'object');
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Vocabularies (named word collections; draft or published)
-- -----------------------------------------------------------------------------
create table if not exists public.vocabularies (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  name             text not null check (char_length(btrim(name)) between 1 and 120),
  description      text not null default '' check (char_length(description) <= 2000),
  source_language  text not null references public.languages (code),
  target_languages text[] not null default '{}' check (cardinality(target_languages) <= 3),
  status           text not null default 'draft' check (status in ('draft', 'published')),
  word_count       integer not null default 0 check (word_count >= 0),
  download_count   integer not null default 0 check (download_count >= 0),
  rating_avg       numeric(3, 2) not null default 0,
  rating_count     integer not null default 0 check (rating_count >= 0),
  published_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  constraint vocabularies_source_not_target check (not (source_language = any (target_languages)))
);

create index if not exists vocabularies_owner_idx
  on public.vocabularies (owner_id) where deleted_at is null;
create index if not exists vocabularies_feed_idx
  on public.vocabularies (status, rating_avg desc, download_count desc) where deleted_at is null;
create index if not exists vocabularies_feed_lang_idx
  on public.vocabularies (source_language, status) where deleted_at is null;

-- -----------------------------------------------------------------------------
-- Words (every word belongs to exactly one vocabulary)
-- -----------------------------------------------------------------------------
create table if not exists public.words (
  id               uuid primary key default gen_random_uuid(),
  vocabulary_id    uuid not null references public.vocabularies (id) on delete restrict,
  owner_id         uuid not null references public.profiles (id) on delete restrict,
  external_id      text check (char_length(external_id) <= 200),
  word_type        text not null check (word_type in (
                     'noun', 'verb', 'adjective', 'adverb', 'preposition',
                     'conjunction', 'pronoun', 'numeral', 'phrase', 'other')),
  headword         text not null check (char_length(btrim(headword)) between 1 and 200),
  translations     jsonb not null default '{}'::jsonb check (jsonb_typeof(translations) = 'object'),
  noun_forms       jsonb check (noun_forms is null or jsonb_typeof(noun_forms) = 'object'),
  verb_forms       jsonb check (verb_forms is null or jsonb_typeof(verb_forms) = 'object'),
  sentences        jsonb not null default '[]'::jsonb check (jsonb_typeof(sentences) = 'array'),
  level            text check (level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  tags             text[] not null default '{}' check (cardinality(tags) <= 20),
  regional_variant text check (char_length(regional_variant) <= 20),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

create index if not exists words_vocabulary_idx
  on public.words (vocabulary_id, id) where deleted_at is null;
create index if not exists words_owner_idx
  on public.words (owner_id) where deleted_at is null;
create unique index if not exists words_vocabulary_headword_uq
  on public.words (vocabulary_id, word_type, lower(btrim(headword))) where deleted_at is null;
create unique index if not exists words_vocabulary_external_uq
  on public.words (vocabulary_id, external_id) where deleted_at is null and external_id is not null;

-- -----------------------------------------------------------------------------
-- Downloads of published vocabularies
-- -----------------------------------------------------------------------------
create table if not exists public.vocabulary_subscriptions (
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  vocabulary_id uuid not null references public.vocabularies (id) on delete restrict,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  primary key (user_id, vocabulary_id)
);

create index if not exists vocabulary_subscriptions_vocabulary_idx
  on public.vocabulary_subscriptions (vocabulary_id) where deleted_at is null;

-- -----------------------------------------------------------------------------
-- Ratings & written reviews of published vocabularies (1..5 stars)
-- -----------------------------------------------------------------------------
create table if not exists public.vocabulary_reviews (
  id            uuid primary key default gen_random_uuid(),
  vocabulary_id uuid not null references public.vocabularies (id) on delete restrict,
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  rating        smallint not null check (rating between 1 and 5),
  comment       text not null default '' check (char_length(comment) <= 2000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  unique (vocabulary_id, user_id)
);

create index if not exists vocabulary_reviews_vocabulary_idx
  on public.vocabulary_reviews (vocabulary_id, created_at desc) where deleted_at is null;

-- -----------------------------------------------------------------------------
-- Quiz sessions (one row per started quiz)
-- -----------------------------------------------------------------------------
create table if not exists public.quiz_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  settings        jsonb not null default '{}'::jsonb,
  vocabulary_ids  uuid[] not null default '{}',
  planned_count   integer not null default 0 check (planned_count >= 0),
  answered_count  integer not null default 0 check (answered_count >= 0),
  cycle_restarted boolean not null default false,
  started_at      timestamptz not null default now(),
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create index if not exists quiz_sessions_user_idx
  on public.quiz_sessions (user_id, started_at desc) where deleted_at is null;

-- -----------------------------------------------------------------------------
-- Learned state per (user, word) — what the quiz algorithm reads
-- -----------------------------------------------------------------------------
create table if not exists public.word_progress (
  user_id          uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  word_id          uuid not null references public.words (id) on delete restrict,
  ease_factor      numeric(4, 2) not null default 2.5 check (ease_factor between 1.3 and 5),
  interval_days    integer not null default 0 check (interval_days between 0 and 3650),
  repetitions      integer not null default 0 check (repetitions >= 0),
  lapses           integer not null default 0 check (lapses >= 0),
  times_seen       integer not null default 0 check (times_seen >= 0),
  total_correct    integer not null default 0 check (total_correct >= 0),
  total_incorrect  integer not null default 0 check (total_incorrect >= 0),
  streak           integer not null default 0 check (streak >= 0),
  last_rating      text check (last_rating in ('very_easy', 'easy', 'good', 'bad', 'very_bad')),
  last_reviewed_at timestamptz,
  next_review_at   timestamptz not null default now(),
  avg_response_ms  integer check (avg_response_ms >= 0),
  seen_in_cycle    boolean not null default false,
  mode_stats       jsonb not null default '{}'::jsonb check (jsonb_typeof(mode_stats) = 'object'),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  primary key (user_id, word_id)
);

create index if not exists word_progress_word_idx on public.word_progress (word_id);

-- -----------------------------------------------------------------------------
-- Every single answer (append-only; "reset" only soft-deletes)
-- -----------------------------------------------------------------------------
create table if not exists public.review_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  word_id     uuid not null references public.words (id) on delete restrict,
  session_id  uuid references public.quiz_sessions (id) on delete restrict,
  mode        text not null check (mode in ('source_to_target', 'target_to_source', 'sentence_writing')),
  rating      text not null check (rating in ('very_easy', 'easy', 'good', 'bad', 'very_bad')),
  shown_at    timestamptz not null,
  answered_at timestamptz not null default now(),
  response_ms integer check (response_ms between 0 and 3600000),
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists review_events_user_word_idx
  on public.review_events (user_id, word_id, answered_at desc) where deleted_at is null;
create index if not exists review_events_word_idx on public.review_events (word_id);
create index if not exists review_events_session_idx on public.review_events (session_id);

-- =============================================================================
-- Trigger functions
-- =============================================================================

create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Creates a profile for every new auth user. The UI language chosen on the
-- sign-up screen (user metadata) is only used as the initial preference.
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_ui text := new.raw_user_meta_data ->> 'ui_language';
begin
  insert into public.profiles (id, display_name, ui_language)
  values (
    new.id,
    left(coalesce(nullif(btrim(split_part(coalesce(new.email, ''), '@', 1)), ''), 'user'), 60),
    case when v_ui in ('fa', 'en') then v_ui else 'fa' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Protects system-managed vocabulary columns and enforces publish rules.
-- pg_trigger_depth() > 1 means the write comes from one of our own counter
-- triggers, which are allowed to change the counters.
create or replace function private.vocabularies_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_is_internal boolean := pg_trigger_depth() > 1;
begin
  if exists (
    select 1 from unnest(new.target_languages) as t(code)
    where not exists (select 1 from public.languages l where l.code = t.code and l.is_enabled)
  ) then
    raise exception 'VOCABULARY_INVALID_LANGUAGE' using errcode = 'P0001';
  end if;

  if tg_op = 'INSERT' then
    if not v_is_internal then
      new.word_count := 0;
      new.download_count := 0;
      new.rating_avg := 0;
      new.rating_count := 0;
      new.status := 'draft';
      new.published_at := null;
      new.created_at := now();
      new.updated_at := now();
      new.deleted_at := null;
    end if;
    return new;
  end if;

  -- UPDATE
  new.id := old.id;
  new.owner_id := old.owner_id;
  new.created_at := old.created_at;

  if not v_is_internal then
    new.word_count := old.word_count;
    new.download_count := old.download_count;
    new.rating_avg := old.rating_avg;
    new.rating_count := old.rating_count;
    new.published_at := old.published_at;

    if new.source_language is distinct from old.source_language and old.word_count > 0 then
      raise exception 'VOCABULARY_LANGUAGE_LOCKED' using errcode = 'P0001';
    end if;

    if new.deleted_at is not null then
      new.status := 'draft';
    end if;

    if new.status = 'published' and old.status <> 'published' then
      if new.word_count < 50 or new.word_count > 5000 then
        raise exception 'VOCABULARY_PUBLISH_LIMIT' using errcode = 'P0001';
      end if;
      new.published_at := now();
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- Words: owner is always the vocabulary owner; vocabulary must be live.
create or replace function private.words_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_owner uuid;
begin
  select v.owner_id into v_owner
  from public.vocabularies v
  where v.id = new.vocabulary_id and v.deleted_at is null;

  if v_owner is null then
    raise exception 'VOCABULARY_NOT_FOUND' using errcode = 'P0001';
  end if;

  new.owner_id := v_owner;
  new.headword := btrim(new.headword);

  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.id := old.id;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- Recounts live words for the given vocabularies; enforces the 5000 cap and
-- auto-unpublishes vocabularies that drop under 50 words.
create or replace function private.refresh_vocabulary_word_counts(p_vocabulary_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_vocabulary_ids is null or cardinality(p_vocabulary_ids) = 0 then
    return;
  end if;

  update public.vocabularies v
     set word_count = c.cnt,
         status = case when v.status = 'published' and c.cnt < 50 then 'draft' else v.status end
    from (
      select ids.id as vocabulary_id,
             (select count(*) from public.words w
               where w.vocabulary_id = ids.id and w.deleted_at is null)::integer as cnt
        from unnest(p_vocabulary_ids) as ids(id)
    ) c
   where v.id = c.vocabulary_id;

  if exists (
    select 1 from public.vocabularies
     where id = any (p_vocabulary_ids) and word_count > 5000
  ) then
    raise exception 'VOCABULARY_WORD_LIMIT' using errcode = 'P0001';
  end if;
end;
$$;

-- Statement-level: one recount per statement, not per row (fast bulk imports).
create or replace function private.words_after_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_ids uuid[];
begin
  if tg_op = 'INSERT' then
    select array_agg(distinct vocabulary_id) into v_ids from new_rows;
  elsif tg_op = 'UPDATE' then
    select array_agg(distinct vocabulary_id) into v_ids
      from (select vocabulary_id from new_rows union select vocabulary_id from old_rows) s;
  else
    select array_agg(distinct vocabulary_id) into v_ids from old_rows;
  end if;
  perform private.refresh_vocabulary_word_counts(v_ids);
  return null;
end;
$$;

create or replace function private.subscriptions_after_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.vocabularies v
     set download_count = (
       select count(*) from public.vocabulary_subscriptions s
        where s.vocabulary_id = v.id and s.deleted_at is null)
   where v.id = coalesce(new.vocabulary_id, old.vocabulary_id);
  return null;
end;
$$;

create or replace function private.reviews_after_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.vocabularies v
     set rating_count = agg.cnt,
         rating_avg = agg.avg_rating
    from (
      select count(*)::integer as cnt, coalesce(round(avg(r.rating)::numeric, 2), 0) as avg_rating
        from public.vocabulary_reviews r
       where r.vocabulary_id = coalesce(new.vocabulary_id, old.vocabulary_id)
         and r.deleted_at is null
    ) agg
   where v.id = coalesce(new.vocabulary_id, old.vocabulary_id);
  return null;
end;
$$;

-- Keeps owner/user columns and creation timestamps immutable.
create or replace function private.user_rows_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

-- =============================================================================
-- Triggers
-- =============================================================================

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

drop trigger if exists vocabularies_guard on public.vocabularies;
create trigger vocabularies_guard
  before insert or update on public.vocabularies
  for each row execute function private.vocabularies_guard();

drop trigger if exists words_guard on public.words;
create trigger words_guard
  before insert or update on public.words
  for each row execute function private.words_guard();

drop trigger if exists words_after_insert on public.words;
create trigger words_after_insert
  after insert on public.words
  referencing new table as new_rows
  for each statement execute function private.words_after_change();

drop trigger if exists words_after_update on public.words;
create trigger words_after_update
  after update on public.words
  referencing new table as new_rows old table as old_rows
  for each statement execute function private.words_after_change();

drop trigger if exists words_after_delete on public.words;
create trigger words_after_delete
  after delete on public.words
  referencing old table as old_rows
  for each statement execute function private.words_after_change();

drop trigger if exists subscriptions_guard on public.vocabulary_subscriptions;
create trigger subscriptions_guard
  before update on public.vocabulary_subscriptions
  for each row execute function private.user_rows_guard();

drop trigger if exists subscriptions_set_updated_at on public.vocabulary_subscriptions;
create trigger subscriptions_set_updated_at
  before update on public.vocabulary_subscriptions
  for each row execute function private.set_updated_at();

drop trigger if exists subscriptions_after_change on public.vocabulary_subscriptions;
create trigger subscriptions_after_change
  after insert or update or delete on public.vocabulary_subscriptions
  for each row execute function private.subscriptions_after_change();

drop trigger if exists reviews_guard on public.vocabulary_reviews;
create trigger reviews_guard
  before update on public.vocabulary_reviews
  for each row execute function private.user_rows_guard();

drop trigger if exists reviews_set_updated_at on public.vocabulary_reviews;
create trigger reviews_set_updated_at
  before update on public.vocabulary_reviews
  for each row execute function private.set_updated_at();

drop trigger if exists reviews_after_change on public.vocabulary_reviews;
create trigger reviews_after_change
  after insert or update or delete on public.vocabulary_reviews
  for each row execute function private.reviews_after_change();

drop trigger if exists quiz_sessions_guard on public.quiz_sessions;
create trigger quiz_sessions_guard
  before update on public.quiz_sessions
  for each row execute function private.user_rows_guard();

drop trigger if exists quiz_sessions_set_updated_at on public.quiz_sessions;
create trigger quiz_sessions_set_updated_at
  before update on public.quiz_sessions
  for each row execute function private.set_updated_at();

drop trigger if exists word_progress_guard on public.word_progress;
create trigger word_progress_guard
  before update on public.word_progress
  for each row execute function private.user_rows_guard();

drop trigger if exists word_progress_set_updated_at on public.word_progress;
create trigger word_progress_set_updated_at
  before update on public.word_progress
  for each row execute function private.set_updated_at();

drop trigger if exists review_events_guard on public.review_events;
create trigger review_events_guard
  before update on public.review_events
  for each row execute function private.user_rows_guard();

-- =============================================================================
-- RPC functions (SECURITY INVOKER: RLS still applies)
-- =============================================================================

-- Replaced by the version below that takes the event id (idempotent retries).
drop function if exists public.record_review(uuid, uuid, text, text, timestamptz, timestamptz, integer, jsonb);

-- Atomically stores one answer and the recalculated learning state.
-- Idempotent: answers recorded offline are re-sent with the same p_event_id,
-- and a repeat of an already stored event changes nothing.
create or replace function public.record_review(
  p_event_id    uuid,
  p_word_id     uuid,
  p_session_id  uuid,
  p_mode        text,
  p_rating      text,
  p_shown_at    timestamptz,
  p_answered_at timestamptz,
  p_response_ms integer,
  p_progress    jsonb
) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  insert into public.review_events
    (id, user_id, word_id, session_id, mode, rating, shown_at, answered_at, response_ms)
  values
    (coalesce(p_event_id, gen_random_uuid()), v_uid, p_word_id, p_session_id, p_mode, p_rating,
     coalesce(p_shown_at, now()), coalesce(p_answered_at, now()), p_response_ms)
  on conflict (id) do nothing;

  if not found then
    return; -- already recorded by an earlier attempt
  end if;

  insert into public.word_progress as wp (
    user_id, word_id, ease_factor, interval_days, repetitions, lapses, times_seen,
    total_correct, total_incorrect, streak, last_rating, last_reviewed_at,
    next_review_at, avg_response_ms, seen_in_cycle, mode_stats, deleted_at
  ) values (
    v_uid,
    p_word_id,
    (p_progress ->> 'ease_factor')::numeric,
    (p_progress ->> 'interval_days')::integer,
    (p_progress ->> 'repetitions')::integer,
    (p_progress ->> 'lapses')::integer,
    (p_progress ->> 'times_seen')::integer,
    (p_progress ->> 'total_correct')::integer,
    (p_progress ->> 'total_incorrect')::integer,
    (p_progress ->> 'streak')::integer,
    p_progress ->> 'last_rating',
    (p_progress ->> 'last_reviewed_at')::timestamptz,
    (p_progress ->> 'next_review_at')::timestamptz,
    (p_progress ->> 'avg_response_ms')::integer,
    coalesce((p_progress ->> 'seen_in_cycle')::boolean, true),
    coalesce(p_progress -> 'mode_stats', '{}'::jsonb),
    null
  )
  on conflict (user_id, word_id) do update set
    ease_factor      = excluded.ease_factor,
    interval_days    = excluded.interval_days,
    repetitions      = excluded.repetitions,
    lapses           = excluded.lapses,
    times_seen       = excluded.times_seen,
    total_correct    = excluded.total_correct,
    total_incorrect  = excluded.total_incorrect,
    streak           = excluded.streak,
    last_rating      = excluded.last_rating,
    last_reviewed_at = excluded.last_reviewed_at,
    next_review_at   = excluded.next_review_at,
    avg_response_ms  = excluded.avg_response_ms,
    seen_in_cycle    = excluded.seen_in_cycle,
    mode_stats       = excluded.mode_stats,
    deleted_at       = null;

  if p_session_id is not null then
    update public.quiz_sessions
       set answered_count = answered_count + 1
     where id = p_session_id and user_id = v_uid;
  end if;
end;
$$;

-- Soft-resets learning history. p_word_ids = null resets everything.
-- Returns the number of words whose progress was reset.
create or replace function public.reset_learning_progress(p_word_ids uuid[] default null)
returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  update public.review_events
     set deleted_at = now()
   where user_id = v_uid
     and deleted_at is null
     and (p_word_ids is null or word_id = any (p_word_ids));

  update public.word_progress
     set deleted_at = now()
   where user_id = v_uid
     and deleted_at is null
     and (p_word_ids is null or word_id = any (p_word_ids));
  get diagnostics v_count = row_count;

  return v_count;
end;
$$;

-- Starts a new round for the given words: previously "parked" words
-- (rated good/easy/very easy this round) become eligible again.
create or replace function public.restart_quiz_cycle(p_word_ids uuid[])
returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  update public.word_progress
     set seen_in_cycle = false
   where user_id = v_uid
     and deleted_at is null
     and seen_in_cycle
     and word_id = any (p_word_ids);
end;
$$;

-- =============================================================================
-- Row Level Security
-- =============================================================================

alter table public.languages                enable row level security;
alter table public.profiles                 enable row level security;
alter table public.vocabularies             enable row level security;
alter table public.words                    enable row level security;
alter table public.vocabulary_subscriptions enable row level security;
alter table public.vocabulary_reviews       enable row level security;
alter table public.quiz_sessions            enable row level security;
alter table public.word_progress            enable row level security;
alter table public.review_events            enable row level security;

-- languages -------------------------------------------------------------------
drop policy if exists "languages: read" on public.languages;
create policy "languages: read" on public.languages
  for select to authenticated using (true);

-- profiles --------------------------------------------------------------------
drop policy if exists "profiles: read" on public.profiles;
create policy "profiles: read" on public.profiles
  for select to authenticated
  using (deleted_at is null or id = (select auth.uid()));

drop policy if exists "profiles: insert own" on public.profiles;
create policy "profiles: insert own" on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- vocabularies ----------------------------------------------------------------
drop policy if exists "vocabularies: read own or published" on public.vocabularies;
create policy "vocabularies: read own or published" on public.vocabularies
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    or (status = 'published' and deleted_at is null)
  );

drop policy if exists "vocabularies: insert own" on public.vocabularies;
create policy "vocabularies: insert own" on public.vocabularies
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists "vocabularies: update own" on public.vocabularies;
create policy "vocabularies: update own" on public.vocabularies
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- words -----------------------------------------------------------------------
drop policy if exists "words: read own or published" on public.words;
create policy "words: read own or published" on public.words
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    or (
      deleted_at is null
      and exists (
        select 1 from public.vocabularies v
         where v.id = words.vocabulary_id
           and v.status = 'published'
           and v.deleted_at is null
      )
    )
  );

-- owner_id is set from the vocabulary by the words_guard trigger, so this
-- check proves the caller owns the target vocabulary.
drop policy if exists "words: insert into own vocabulary" on public.words;
create policy "words: insert into own vocabulary" on public.words
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists "words: update own" on public.words;
create policy "words: update own" on public.words
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- vocabulary_subscriptions ----------------------------------------------------
drop policy if exists "subscriptions: read own" on public.vocabulary_subscriptions;
create policy "subscriptions: read own" on public.vocabulary_subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "subscriptions: insert own" on public.vocabulary_subscriptions;
create policy "subscriptions: insert own" on public.vocabulary_subscriptions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.vocabularies v
       where v.id = vocabulary_id
         and v.status = 'published'
         and v.deleted_at is null
         and v.owner_id <> (select auth.uid())
    )
  );

drop policy if exists "subscriptions: update own" on public.vocabulary_subscriptions;
create policy "subscriptions: update own" on public.vocabulary_subscriptions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (
      deleted_at is not null
      or exists (
        select 1 from public.vocabularies v
         where v.id = vocabulary_id
           and v.status = 'published'
           and v.deleted_at is null
           and v.owner_id <> (select auth.uid())
      )
    )
  );

-- vocabulary_reviews ----------------------------------------------------------
drop policy if exists "reviews: read" on public.vocabulary_reviews;
create policy "reviews: read" on public.vocabulary_reviews
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      deleted_at is null
      and exists (
        select 1 from public.vocabularies v
         where v.id = vocabulary_reviews.vocabulary_id
           and (v.owner_id = (select auth.uid()) or (v.status = 'published' and v.deleted_at is null))
      )
    )
  );

drop policy if exists "reviews: insert own" on public.vocabulary_reviews;
create policy "reviews: insert own" on public.vocabulary_reviews
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.vocabularies v
       where v.id = vocabulary_id
         and v.status = 'published'
         and v.deleted_at is null
         and v.owner_id <> (select auth.uid())
    )
  );

drop policy if exists "reviews: update own" on public.vocabulary_reviews;
create policy "reviews: update own" on public.vocabulary_reviews
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.vocabularies v
       where v.id = vocabulary_id
         and v.owner_id <> (select auth.uid())
    )
  );

-- quiz_sessions / word_progress / review_events: strictly private -----------
drop policy if exists "quiz_sessions: own" on public.quiz_sessions;
create policy "quiz_sessions: own" on public.quiz_sessions
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "quiz_sessions: insert own" on public.quiz_sessions;
create policy "quiz_sessions: insert own" on public.quiz_sessions
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "quiz_sessions: update own" on public.quiz_sessions;
create policy "quiz_sessions: update own" on public.quiz_sessions
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "word_progress: own" on public.word_progress;
create policy "word_progress: own" on public.word_progress
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "word_progress: insert own" on public.word_progress;
create policy "word_progress: insert own" on public.word_progress
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "word_progress: update own" on public.word_progress;
create policy "word_progress: update own" on public.word_progress
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "review_events: own" on public.review_events;
create policy "review_events: own" on public.review_events
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "review_events: insert own" on public.review_events;
create policy "review_events: insert own" on public.review_events
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "review_events: update own" on public.review_events;
create policy "review_events: update own" on public.review_events
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- =============================================================================
-- Privileges: no anonymous access, and no hard deletes for anyone via the API
-- =============================================================================

revoke all on
  public.languages, public.profiles, public.vocabularies, public.words,
  public.vocabulary_subscriptions, public.vocabulary_reviews,
  public.quiz_sessions, public.word_progress, public.review_events
from anon, authenticated;

grant select on public.languages to authenticated;
grant select, insert, update on
  public.profiles, public.vocabularies, public.words,
  public.vocabulary_subscriptions, public.vocabulary_reviews,
  public.quiz_sessions, public.word_progress, public.review_events
to authenticated;

revoke all on function public.record_review(uuid, uuid, uuid, text, text, timestamptz, timestamptz, integer, jsonb) from public, anon;
revoke all on function public.reset_learning_progress(uuid[]) from public, anon;
revoke all on function public.restart_quiz_cycle(uuid[]) from public, anon;
grant execute on function public.record_review(uuid, uuid, uuid, text, text, timestamptz, timestamptz, integer, jsonb) to authenticated;
grant execute on function public.reset_learning_progress(uuid[]) to authenticated;
grant execute on function public.restart_quiz_cycle(uuid[]) to authenticated;

-- =============================================================================
-- Backfill profiles for users that signed up before this schema existed
-- =============================================================================
insert into public.profiles (id, display_name)
select u.id,
       left(coalesce(nullif(btrim(split_part(coalesce(u.email, ''), '@', 1)), ''), 'user'), 60)
  from auth.users u
on conflict (id) do nothing;
