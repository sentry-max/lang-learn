# Lang Learn

A spaced-repetition vocabulary trainer for any language (German, English and
Persian are enabled today). Build vocabularies by hand or from JSON, publish
them to a shared feed, download other people's vocabularies, rate and review
them, and practice with an adaptive quiz that learns from every answer.

## Stack

- React 18 + TypeScript + Vite, React Router
- Supabase (Postgres, Auth, Row Level Security) — all user data lives there
- Vitest for unit tests

## Architecture

Clean architecture, four layers, dependencies pointing inwards only:

```
src/
  domain/          entities, repository ports, pure business rules
                   (quiz selection, spaced repetition, placement, parsing)
  application/     services & use cases orchestrating domain rules over ports
  infrastructure/  Supabase repositories, in-memory word cache
  presentation/    React pages, components, contexts (composition root:
                   presentation/context/ServicesContext.tsx)
```

Reads are cached (`src/infrastructure/cache/QueryCache.ts`): data loaded in the last 90 seconds is shown without a
request, older data is shown at once and refreshed in the background, writes refresh what they changed, and the
lists are kept per user between visits so the app opens with data on screen. A thin bar under the top bar shows
when anything is loading.

The domain and application layers have no React or Supabase imports, so the
quiz algorithm and all business rules are unit-tested in isolation
(`src/test/inMemoryRepositories.ts` provides in-memory ports for tests).

## Data model

| Table | Purpose |
|---|---|
| `languages` | Supported languages (`de`, `en`, `fa`) |
| `profiles` | One per user: display name, primary language, UI language, last quiz settings |
| `vocabularies` | Named word collections: name, description, author, word language, translation languages, draft/published, word/download/rating counters, created/updated/published dates |
| `words` | Every word belongs to exactly one vocabulary (`vocabulary_id`) |
| `vocabulary_subscriptions` | Downloads of published vocabularies |
| `vocabulary_reviews` | 1–5 star ratings with an optional written review |
| `quiz_sessions` | One row per quiz started |
| `word_progress` | What the app has learned per (user, word) |
| `review_events` | Every answer: when shown, how long it took, direction, rating |
| `sentence_collections` | Named sets of sentence exercises: name, description, language, draft/published, exercise counter |
| `sentence_collection_subscriptions` | Downloads of published sentence collections |
| `sentence_exercises` | Sentence exercises; each belongs to one collection (`kind` plus its fields in `content`) |
| `sentence_attempts` | Every answered sentence: errors, allowed errors, timer mode, the answer, timing |
| `conversation_attempts` | One row per conversation run: dialogue id and version, the roles read by people and the bot, turns per person |
| `conversation_line_results` | Every line read aloud: role, expected text, what was heard, errors, recording path |
| Storage `conversation-recordings` | Private bucket with one audio file per line read aloud, in a folder per user |

Rules enforced in the database (not just the UI):

- **Soft delete everywhere.** Deleting sets `deleted_at`. The API role has no
  `DELETE` privilege, so nothing can be hard-deleted through the app.
- **Publishing needs 50–5000 words.** Fewer words → it stays a private draft.
  A published vocabulary that drops below 50 words becomes a draft again.
  A vocabulary can never exceed 5000 words.
- **Only published vocabularies are used in quizzes** — your own published
  ones plus the ones you downloaded. Drafts are never quizzed, even for their
  author.
- Counters (`word_count`, `download_count`, `rating_avg`, `rating_count`)
  are maintained by triggers and can't be written by clients.
- Row Level Security: drafts and learning data are private; published
  vocabularies, their words and reviews are readable by every signed-in user;
  only the owner can change a vocabulary or its words; you can't download or
  review your own vocabulary.

## How the quiz chooses words

Implemented in `src/domain/services/QuizSelectionService.ts`,
`SpacedRepetitionService.ts` and `QuizSession.ts`.

Every quiz belongs to a **letter collection**: `all` when no starting letter
is chosen, otherwise the chosen letters (`B`, `A,B`). A new letter choice is a
new collection. Each collection keeps its own rounds and its own answer
history (`review_events.collection_key`); the learning progress of a word
(`word_progress`: spaced repetition, last rating, stats) is shared by all of
them, and the dashboard and History count every answer.

Each word in the chosen pool (selected vocabularies, narrowed to the
collection's letters) is in one bucket:

- **parked** – already asked in this collection's current round, whatever the
  rating. Not asked again until every word in the pool has been asked.
- **weak** – not asked this round, last rated *bad* or *very bad*. Prioritized.
- **fresh** – every other word.

When the pool has no weak or fresh words left, the round is complete and a new
one starts (`quiz_collection_rounds.started_at`; a word answered in the
collection since then counts as asked). If they run out part-way through a
session, the new round starts immediately so the session is still full.
**Clear test history** on the quiz screen starts a new round for the current
collection by hand; answers and progress are kept. "All" asks every word of
the chosen letters; without letters it is capped at 200.

Within a bucket, words are drawn by **weighted random sampling across the
whole pool** — never alphabetically, and also random within a single chosen
letter. Weights are learned from the user's answers:

- weak words: severity, number of lapses, how overdue they are, hesitation,
  and a short rest after being just answered;
- words returning in a new round: how hard they've been for this user
  (accuracy, ease, lapses, answer time) plus a boost when their
  spaced-repetition review is due — hard words come back first.

It adapts to what the user does:

- The share of a session given to weak words grows when the user has been
  struggling recently (up to ~75%) and shrinks when they're doing well (~25%).
- In "mix" direction, the direction the user gets wrong more often for a
  word is asked more often. Sentence-writing is only asked for words the user
  already knows.
- A word rated bad/very bad comes back once more a few questions later in
  the same session.
- The time to answer is recorded; a slow "easy" is scheduled more
  cautiously (the user's own rating still decides parking).

## Quiz modes and settings

Before the timer mode, the quiz asks for the **test type**:

- **Recall** – recall the answer from memory, then rate yourself (very easy … very bad).
- **Multiple choice** – pick the answer from four options and the app rates it
  (`src/domain/services/MultipleChoiceService.ts`). Sentence writing is not asked.
  The three wrong options come from the chosen vocabularies, closest first: words
  sharing a tag with the answer, then words spelled similarly, then words sharing
  the most first or last letters (3, then 2, then 1), then any word at random.
  Synonyms of the answer are never offered, and the correct answer is always there.
  - Classic: correct is *easy*, wrong is *very bad*.
  - Quiz timer: each question gets the time left divided by the questions left
    (at the start, the whole time divided by the number of questions), so every
    question fits. Word timer: each question gets the word timer.
  - Timed, a correct choice in the first 55% of the question's time is *very easy*,
    in the next 25% *easy*, later *good*. A wrong choice or running out of time is
    *very bad*.

The quiz settings have three tabs, each with a short explanation:

- **Classic** – no time limit.
- **Quiz timer** – one countdown (1 second to 5 hours, picked as h/m/s) for
  the whole quiz. When it runs out the quiz ends; words not reached are not
  recorded and stay untouched for later.
- **Word timer** – a countdown per word that restarts for each word. If it
  runs out before an answer, the word is recorded as *very bad* and the quiz
  moves on.

Both show a countdown with a bar that shrinks as time runs out and turns red
in the last 15%. The per-word clock pauses while the "exit quiz" dialog is
open; the whole-quiz clock keeps running.

**Settings** (saved automatically to `profiles.preferences` as you change them): theme (system/light/dark,
applied instantly), text size, reduce motion; for each rating whether the
answer is shown and whether the quiz moves on automatically after a delay
(defaults: very easy/easy/good show the answer for 2 s then move on; bad/very
bad wait for "Next"); always show the example sentence; sound effects with
their own switch and volume (a mute button in the quiz toggles them too —
pronunciation is separate); read words aloud with adjustable speed; keyboard
shortcuts (1–5 rate, Enter next, H hint, P pronounce, Esc exit); keep the
add-word dialog open after saving; default quiz vocabularies (pre-selected
on the quiz screen — otherwise nothing is selected and you pick in the
searchable vocabulary box: tap a name to pick just that one, or tick several). With reduce motion on, progress bars and
countdowns move in plain one-second steps and nothing spins or pulses.

Connection and sync status is a small cloud icon in the top bar (a badge
shows answers waiting to sync); click it for details or "Sync now". It never
shifts the page.


The app keeps working when the connection drops, for as long as the browser
tab stays open (`src/infrastructure/offline/`):

- Everything already loaded stays usable from memory: your own and
  downloaded vocabularies, their words, reviews, feed pages and your learned
  progress. Right after sign-in, after every reconnect and after each
  download, the whole quiz library (vocabularies, words, progress) is
  preloaded so it's in memory before you need it.
- Quizzes run fully offline with the same adaptive algorithm. Answers, new
  rounds and quiz sessions are applied locally at once and queued in an
  outbox. The outbox is also saved to localStorage, so answers aren't lost
  even if the tab is reloaded while offline.
- When the connection returns, the outbox is sent in order (each write is
  idempotent on the server, so a retry never double-counts), the caches are
  marked stale and open pages refetch. Writes the server can't accept yet are
  retried every 15 seconds.
- Creating, editing, publishing, downloading, reviewing and resetting history
  need a connection and say so when you're offline.
- A reload or a new visit starts with an empty memory cache, so it needs to
  be online to load data again.

## Sentence practice

Sentences are a section of their own, next to words. The **Sentences** tab
(`src/presentation/pages/SentencePracticePage.tsx`) practices them, and **Vocabularies**, **Explore**,
**History** and **Progress** each have a *Words | Sentences* switch (`?section=sentences` in the URL):

- **Vocabularies → Sentences** – your sentence collections (create, edit, import JSON with ⬆, publish,
  delete) and the ones you downloaded. A collection starts as a private draft; one with at least one exercise
  can be published. Import format: `data/sentences.schema.json`; `data/sentences.sample.json` (German) and
  `data/sentences.sample.en.json` (English) show every kind and field.
- **Explore → Sentences** – other people's published collections, searchable, to download.
- **History → Sentences** – every answered sentence, newest first by day; tap one for the graded answer.
- **Progress → Sentences** – overall score, the last 7 days against the 7 before, weak areas, a score per
  exercise type and per grammar topic, kinds of mistakes, words to review, and 14 days of activity.
- **Settings → Sentences** – default collections, forgive typos, show translation and hint right away, extra
  words in word order by default.

Practice draws from your own collections (drafts too) and downloaded ones; the dropdown lists only collections
that have exercises. The task is shown in a highlighted banner.

- **Fill in** – one or two blanks (`___`). A tapped word goes into the chosen blank (tap a blank to choose it),
  else the first empty one, else the last one, replacing the word there; with one blank a new word simply
  replaces the old. **Submit** turns on when every blank is filled.
- **Word order** – tapped words fly onto the answer line in tap order. Drag a placed word to move it (touch or
  mouse; the arrow keys move it too), tap it to send it back. **Extra words** mixes in distractors. Other
  accepted orders (`alternatives`) count as correct.
- **Rewrite** – turn the sentence into another tense, a negative, a question, or active ↔ passive. The answer
  is compared word by word with the closest accepted sentence. With **Forgive typos** on, a misspelt word is
  marked (amber, with the right spelling) but not counted: up to 1 letter off (2 for words of 8+ letters,
  ß/ä/ö/ü typed as ss/ae/oe/ue are fine), never for words under 4 letters, never when the last two letters
  differ (that is where grammar lives: *spielt/spielte*, *den/dem*), and capitals only on the first word.

Each mode runs **Classic** (untimed), with a **Total time**, or with a **Time per sentence** (when it runs out,
what you have is graded as it is; when the total time runs out, sentences not reached aren't recorded).

**Scoring** (`src/domain/services/SentenceGrading.ts`): every exercise has a most-errors benchmark (blanks,
words in the sentence, or words in the accepted answer), and the score is `1 − errors ÷ benchmark`, never
below 0. A run's score is all its errors against all its benchmarks. Results show a score ring, a chip per kind
of mark (correct, wrong, missing, not needed, typo), the answer word by word and the correct sentence; the run
summary lists the topics and words to practice more.

**Insights** (`src/domain/services/SentenceInsights.ts`) are worked out from the stored attempts, re-grading
each answer against its exercise: scores per exercise type, per tag and per transformation task, mistake types,
words missed at least twice, the weekly trend and daily activity. Nothing extra is stored.

Every answer goes to `sentence_attempts` through the offline outbox. **Choosing sentences**
(`src/domain/services/SentenceSelectionService.ts`) is weighted random sampling with weights learned from
those attempts: low last and recent scores raise an exercise's weight, as does a weak topic (a tag or a
transformation task) and each word you keep getting wrong that the exercise contains; mastered exercises
(90%+) rest 1, 2, 4, 8 … days; slow answers come back a bit more often; untried exercises get a steady share;
one answered in the last few minutes almost never repeats.

## Conversations

The Conversations tab offers ready-made dialogues (`data/dialogue/*.json`, format and CEFR level guide in
`data/dialogue/dialogue.schema.json`).

- **Setup.** 1–5 people read, and the bot can read one more role. A dialogue works with any number of speakers from its
  required roles up to all roles, so optional roles drop out when fewer people take part. Each person reads 3–7 turns.
- **Demo.** The app's voices read the whole dialogue, a female and a male voice by role. It can be paused, resumed and
  played again.
- **Reading.** The active line sits at the bottom of the screen with its role, its reader and its translation. The
  browser's speech recognition hears it, and each word is marked correct, nearly right (half an error), wrong, missing
  or extra. Fillers, case, punctuation, digits for number words and split compounds don't count. A line can be read
  again before moving on.
- **Scores per role.** Every role keeps its own readings, last, best and average score and words to review, because a
  learner who always takes the same role needs that role's own progress. The latest take of each role can be played
  back.
- **Recordings.** Every line read aloud is stored as its own audio file in Supabase Storage, under the user's folder
  and the run's id. Nothing is ever replaced or deleted.
- Everything is free: browser speech synthesis, speech recognition (Chrome, Edge, Safari) and recording, plus the
  existing Supabase project. Speech recognition needs a connection; the demo works offline when the device has voices.

## Phones

On small screens the app is laid out for one-handed use:

- Tabs sit in a bottom bar; a page's main actions (new vocabulary, add word,
  import, download) float just above it. Both hide while you type, so the
  keyboard has room.
- A running quiz goes full screen: the word in the middle and the rating
  buttons (or **Next**) pinned to the bottom. Swipe the card sideways to go
  to the next word. Answers can also vibrate (Settings → Sound effects).
- Dialogs open as bottom sheets; drag one down to close it.
- The language menu and sign-out move to Settings (Profile and Account).

Performance: fonts load in parallel with the app, other pages are fetched in
the background once the device is idle (skipped with Data Saver or on 2G),
long lists skip rendering rows that are off screen, and countdowns re-render
only their own bar. `public/_headers` lets Cloudflare cache the hashed build
files for a year.

## Liquid Glass style

Settings → Appearance → **Liquid Glass style** switches the whole app to an
iPhone look, in light and dark (it follows the Theme setting):

- Frosted glass cards, bars, sheets and menus over a soft color wash, with a
  bright rim and sheen; a floating glass tab bar with a "lens" behind the
  current tab; sheets that float inset from the screen edges.
- iOS system colors (blue, green, orange, red…) and San Francisco type on
  Apple devices (Inter / Vazirmatn elsewhere).
- iOS controls: green switches, segmented pickers, round checkmarks, capsule
  buttons, filled text fields.
- SF-Symbols-style icons (gear, bolt, clock, book, square-and-arrow…) and a
  glass version of the app icon and loading mascot, with the same ring-and-dot mark.

It's saved with the rest of your settings (the `liquidGlass` preference). With
the system's "Reduce transparency" setting on, surfaces become solid and the
blur is turned off.

## Word forms

When the answer is revealed in a quiz, and when you open a word in a
vocabulary, the app shows everything about the word: its type, level, meaning,
every example sentence, its tags and all of its forms.

- **German nouns**: the plural, then nominative, accusative and dative in the
  singular and plural, each with its definite, indefinite and negative article
  (`der Student · ein Student · kein Student`, `den Studenten · einen Studenten ·
  keinen Studenten`), including the n-declension and the dative plural `-n`.
- **German verbs**: Präsens, Präteritum, Perfekt, Plusquamperfekt, Futur I and
  II, Konjunktiv I and II, Imperativ and the passive, for every person (ich, du,
  er, sie, es, wir, ihr, sie, Sie), with separable prefixes and reflexive pronouns
  in the right place (dative `mir`/`dir` when the verb also takes an object, as in
  `sich etwas merken`). Each verb also shows the personal pronouns in the
  nominative, accusative and dative (`ich · mich · mir`).
- **English nouns**: the plural.
- **English verbs**: all twelve tenses, the conditionals, the imperative and the
  passive, for every person.

Forms are worked out from what each word already stores (the article and plural,
or the principal parts), so nothing extra is imported or migrated. English verbs
and plurals with nothing stored are derived from rules and a list of irregular
words. Forms stored on a word always win; a missing or blank field just hides
what depends on it (no simple past → no Präteritum table). Tapping the details stops the automatic
move to the next word, so there is time to read them.

Code: `src/domain/services/WordInflectionService.ts`. Persian words show a stored
plural only.

## Vocabularies

- **Create**: title (required) and description (optional), the words'
  language and the translation languages. It starts as a draft; add words by
  hand or import one or several JSON files at once, then publish.
- **Add word from the Vocabularies page**: with *Automatic*, the word goes
  into your best-matching vocabulary for its language (same level, shared
  tags, covers its translation languages, prefers published ones), or a new
  draft vocabulary is created (`VocabularyPlacementService`).
- **Feed**: search, filter by language, sort by rating/downloads/newest;
  download, open, rate and review.
- JSON format: see `data/vocabulary.schema.json`, `data/vocabulary.sample.json`
  (German) and `data/vocabulary.sample.en.json` (English). Re-importing a word with the same `id`
  updates it; the same word type + headword under a different id is skipped
  as a duplicate.

## History

The **History** tab lists the starting letters of every word you've seen.
Pick a letter to see each word with its full answer history (when it was
shown, how long you took, direction, your rating). You can reset one letter,
all words whose last answer was a given rating, or everything. Resets are
soft: history is archived, not deleted.

## Setup

1. Create a Supabase project.
2. In the SQL editor, run **`supabase/schema.sql`** (safe to re-run).
3. **Upgrading from v1** (tables `vocabulary_entries`, `progress_state`,
   `review_records`)? Then also run
   **`supabase/migrations/20260930_001_migrate_v1_data.sql`** once. It moves
   the old shared word list into a vocabulary owned by the earliest
   registered user (published if it has 50–5000 words), gives it as a
   download to everyone else who practiced it, copies progress and answer
   history, and renames the v1 tables to `legacy_*` (nothing is dropped).
4. `cp .env.example .env` and fill in `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY`.
5. `npm install && npm run dev`, sign up, create a vocabulary and import
   `data/vocabulary.sample.json` (word language German) or
   `data/vocabulary.sample.en.json` (word language English).

Note: `profiles.id` references `auth.users` with `on delete restrict`, so a
user who has data can't be removed from the Supabase dashboard by accident.

## Testing

```
npm test
```

Covers the quiz selection algorithm (randomness across letters, rounds,
parking, weak-word priority, adaptive share, direction choice), spaced
repetition and response-time learning, in-session retries, letter handling
for Latin and Persian, placement, JSON parsing, import/update/duplicate
rules, quiz generation end-to-end over in-memory repositories, the word
cache, and offline operation (cache fallback, outbox ordering, persistence,
retries, and a full offline quiz followed by reconnect and sync).
