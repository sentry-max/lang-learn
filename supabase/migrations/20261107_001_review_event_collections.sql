-- =============================================================================
-- Tags answers given before letter collections with the collection of their quiz,
-- worked out from the letters saved in the quiz session's settings:
-- no letters -> 'all', otherwise the letters upper-cased, de-duplicated, sorted and joined with ','.
-- Answers given outside a quiz session stay untagged.
--
-- Prerequisite: run supabase/schema.sql first.
-- Safe to re-run: it only touches answers that have no collection yet.
-- =============================================================================

update public.review_events e
   set collection_key = coalesce(
         (select string_agg(letters.letter, ',' order by letters.letter)
            from (select distinct upper(value) collate "C" as letter
                    from jsonb_array_elements_text(
                           case when jsonb_typeof(s.settings -> 'letters') = 'array' then s.settings -> 'letters' else '[]'::jsonb end
                         )
                   where btrim(value) <> '') letters),
         'all')
  from public.quiz_sessions s
 where e.session_id = s.id
   and e.user_id = s.user_id
   and e.collection_key is null;
-000
0