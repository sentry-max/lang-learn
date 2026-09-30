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

Each word in the chosen pool (selected vocabularies, optionally narrowed to
some starting letters) is in one bucket:

- **weak** – last rated *bad* or *very bad*. Always eligible and prioritized.
- **fresh** – never shown, or not shown yet in the current round.
- **parked** – rated *good*, *easy* or *very easy* this round. Not shown again
  until every other word in the pool has been shown once.

When the pool runs out of fresh words, the round is complete: parked words
are released and a new round starts (persisted per word as
`word_progress.seen_in_cycle`). If fresh words run out part-way through a
session, the new round starts immediately so the session is still full.

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
- JSON format: see `data/vocabulary.schema.json` and
  `data/vocabulary.sample.json`. Re-importing a word with the same `id`
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
   `data/vocabulary.sample.json`.

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
