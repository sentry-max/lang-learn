-- =============================================================================
-- One-time migration: v1 (single shared German word list) -> v2 (vocabularies)
--
-- Prerequisite: run supabase/schema.sql first.
--
-- What it does
--   1. Creates one vocabulary "German B1 (imported)" owned by the earliest
--      registered user and moves every v1 word into it (the old text id is
--      kept as words.external_id, so re-importing the same JSON file updates
--      words instead of duplicating them).
--   2. Publishes that vocabulary when it has 50..5000 words (only published
--      vocabularies appear in quizzes).
--   3. Every other user who has v1 progress gets it as a download.
--   4. Copies progress_state -> word_progress and review_records -> review_events.
--   5. Renames the v1 tables to legacy_* and revokes API access to them.
--      Nothing is dropped.
--
-- Safe to re-run: it does nothing once the v1 tables have been renamed.
-- =============================================================================

do $$
declare
  v_owner      uuid;
  v_vocabulary uuid;
  v_words      integer;
begin
  if to_regclass('public.vocabulary_entries') is null then
    raise notice 'No v1 tables found - nothing to migrate.';
    return;
  end if;

  select u.id into v_owner
    from auth.users u
    join public.profiles p on p.id = u.id
   order by u.created_at
   limit 1;

  if v_owner is not null and exists (select 1 from public.vocabulary_entries) then
    insert into public.vocabularies (owner_id, name, description, source_language, target_languages)
    values (
      v_owner,
      'German B1 (imported)',
      'Words migrated from the first version of the app.',
      'de',
      array['en', 'fa']
    )
    returning id into v_vocabulary;

    insert into public.words (
      vocabulary_id, owner_id, external_id, word_type, headword, translations,
      noun_forms, verb_forms, sentences, level, tags, regional_variant
    )
    select distinct on (e.word_type, lower(btrim(e.headword)))
      v_vocabulary,
      v_owner,
      e.id,
      e.word_type,
      e.headword,
      case jsonb_typeof(e.translations)
        when 'array' then jsonb_build_object('en', e.translations)
        when 'object' then e.translations
        else '{}'::jsonb
      end,
      e.noun_forms,
      e.verb_forms,
      coalesce((
        select jsonb_agg(jsonb_build_object(
                 'text', coalesce(s ->> 'german', s ->> 'text', ''),
                 'translations', case
                   when s ? 'translations' then s -> 'translations'
                   when s ? 'english' then jsonb_build_object('en', s ->> 'english')
                   else '{}'::jsonb
                 end))
          from jsonb_array_elements(case jsonb_typeof(e.sentences) when 'array' then e.sentences else '[]'::jsonb end) s
      ), '[]'::jsonb),
      case when e.level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2') then e.level else null end,
      coalesce(array(select jsonb_array_elements_text(
        case jsonb_typeof(e.tags) when 'array' then e.tags else '[]'::jsonb end)), '{}'),
      e.regional_variant
    from public.vocabulary_entries e
    order by e.word_type, lower(btrim(e.headword)), e.created_at;

    select word_count into v_words from public.vocabularies where id = v_vocabulary;

    if v_words between 50 and 5000 then
      update public.vocabularies set status = 'published' where id = v_vocabulary;
    else
      raise notice 'Imported vocabulary has % words; left as draft (publishing needs 50..5000).', v_words;
    end if;

    -- Everyone else who practiced the shared list gets it as a download.
    insert into public.vocabulary_subscriptions (user_id, vocabulary_id)
    select distinct ps.user_id, v_vocabulary
      from public.progress_state ps
      join public.profiles p on p.id = ps.user_id
     where ps.user_id <> v_owner
    on conflict (user_id, vocabulary_id) do nothing;

    insert into public.word_progress (
      user_id, word_id, ease_factor, interval_days, repetitions, lapses, times_seen,
      total_correct, total_incorrect, streak, last_rating, last_reviewed_at,
      next_review_at, seen_in_cycle
    )
    select
      ps.user_id,
      w.id,
      least(greatest(ps.ease_factor, 1.3), 5),
      least(greatest(ps.interval_days, 0), 3650),
      greatest(ps.repetitions, 0),
      0,
      greatest(ps.total_correct + ps.total_incorrect, case when ps.last_rating is null then 0 else 1 end),
      greatest(ps.total_correct, 0),
      greatest(ps.total_incorrect, 0),
      greatest(ps.repetitions, 0),
      case when ps.last_rating in ('very_easy', 'easy', 'good', 'bad', 'very_bad') then ps.last_rating end,
      ps.last_reviewed_at,
      ps.next_review_date,
      ps.last_rating is not null
    from public.progress_state ps
    join public.profiles p on p.id = ps.user_id
    join public.words w on w.vocabulary_id = v_vocabulary and w.external_id = ps.vocabulary_entry_id
    on conflict (user_id, word_id) do nothing;

    insert into public.review_events (id, user_id, word_id, mode, rating, shown_at, answered_at)
    select
      rr.id,
      rr.user_id,
      w.id,
      case rr.mode
        when 'de_to_en' then 'source_to_target'
        when 'en_to_de' then 'target_to_source'
        else 'sentence_writing'
      end,
      rr.difficulty_rating,
      rr.answered_at,
      rr.answered_at
    from public.review_records rr
    join public.profiles p on p.id = rr.user_id
    join public.words w on w.vocabulary_id = v_vocabulary and w.external_id = rr.vocabulary_entry_id
    where rr.difficulty_rating in ('very_easy', 'easy', 'good', 'bad', 'very_bad')
    on conflict (id) do nothing;
  end if;

  alter table public.review_records     rename to legacy_review_records;
  alter table public.progress_state     rename to legacy_progress_state;
  alter table public.vocabulary_entries rename to legacy_vocabulary_entries;

  revoke all on public.legacy_review_records, public.legacy_progress_state,
                public.legacy_vocabulary_entries
    from anon, authenticated;
end;
$$;
