-- B1 Vocab Trainer — Supabase schema
-- Run this in the Supabase SQL editor (or via `supabase db push`).

create table if not exists vocabulary_entries (
  id text primary key,
  word_type text not null,
  headword text not null,
  translations jsonb not null,
  noun_forms jsonb,
  verb_forms jsonb,
  sentences jsonb not null,
  level text not null default 'B1',
  tags jsonb not null default '[]'::jsonb,
  regional_variant text,
  created_at timestamptz not null default now()
);

create table if not exists progress_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  vocabulary_entry_id text not null references vocabulary_entries(id) on delete cascade,
  ease_factor numeric not null default 2.5,
  interval_days integer not null default 0,
  repetitions integer not null default 0,
  next_review_date timestamptz not null default now(),
  total_correct integer not null default 0,
  total_incorrect integer not null default 0,
  last_reviewed_at timestamptz,
  last_rating text,
  primary key (user_id, vocabulary_entry_id)
);

create table if not exists review_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  vocabulary_entry_id text not null references vocabulary_entries(id) on delete cascade,
  mode text not null,
  user_answer text,
  was_correct boolean,
  difficulty_rating text not null,
  answered_at timestamptz not null default now()
);

create index if not exists idx_progress_user on progress_state(user_id);
create index if not exists idx_review_user on review_records(user_id);
create index if not exists idx_review_entry on review_records(vocabulary_entry_id);

-- Row Level Security: vocabulary is shared/read-only for all signed-in users;
-- progress and review history are private to each user.
alter table vocabulary_entries enable row level security;
alter table progress_state enable row level security;
alter table review_records enable row level security;

create policy "Vocabulary is readable by authenticated users"
  on vocabulary_entries for select
  using (auth.role() = 'authenticated');

create policy "Vocabulary is writable by authenticated users"
  on vocabulary_entries for insert
  with check (auth.role() = 'authenticated');

create policy "Vocabulary is updatable by authenticated users"
  on vocabulary_entries for update
  using (auth.role() = 'authenticated');

create policy "Users manage their own progress"
  on progress_state for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage their own review records"
  on review_records for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
