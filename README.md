# B1 Vocab Trainer

A spaced-repetition German B1 vocabulary trainer. Import vocabulary as JSON,
take daily quizzes (German↔target-language recall and free sentence
composition), self-check your own knowledge with a 5-level rating instead
of typing answers, and let the app automatically prioritize your weak
words in future sessions.

## Stack

- React 18 + TypeScript + Vite
- React Router for navigation
- Supabase (Postgres + Auth) for vocabulary storage and per-user progress
  in cloud mode — or entirely local `localStorage` in offline mode, no
  backend required (see below)
- Vitest for unit tests

## Architecture

The code follows clean architecture, split into four layers with a strict
dependency direction (outer layers depend on inner layers, never the
reverse):

```
src/
  domain/           entities, repository interfaces, pure business logic
                     (spaced-repetition scheduling). No framework or I/O.
  application/       use cases that orchestrate domain logic against
                     repository interfaces (GenerateQuiz, SubmitAnswer,
                     GetStats, ImportVocabulary).
  infrastructure/    Supabase client, local-storage, and sync repository
                     implementations — the only place that knows about
                     the database or browser storage.
  presentation/      React pages, components, and context providers
                     (the composition root that wires everything together).
```

This means:
- The spaced-repetition algorithm and quiz-selection logic are pure
  functions/classes with no dependency on React or Supabase — fully unit
  tested in isolation (`npm test`).
- Swapping Supabase for another backend later means writing new classes
  that implement `VocabularyRepository` / `ProgressRepository` — nothing
  in `domain/` or `application/` has to change. This is exactly how
  offline mode works: it's a second, real implementation of the same two
  interfaces, backed by `localStorage` instead of Supabase (see
  `infrastructure/local/`).
- Adding a new question mode, quiz strategy, or grading rule is a change
  to `application/` and `domain/`, not scattered across UI components.

## Data model: one vocabulary, offline-first with sync

There is a single vocabulary dataset — not separate online/offline copies.
In cloud mode (the default), every read and write goes through a local
cache first (instant, works offline), which mirrors itself to Supabase in
the background:

- **Reads** always come from the local cache, so the app is fast and
  works with no connection.
- **Writes** (add, edit, delete, import) save locally immediately, then
  push to Supabase right away if you're online. If you're offline, the
  change is queued instead.
- **Queued changes sync automatically** the moment the browser regains
  connectivity, and also once on every app launch. There's also a manual
  **Re-sync** button on the Vocabularies page, which shows how many
  changes are pending and when it last synced.
- **Resync** always pushes queued local changes *before* pulling fresh
  data from Supabase, so nothing you changed offline gets silently
  overwritten by an older remote copy.

This is implemented as `infrastructure/sync/SyncingVocabularyRepository.ts`,
a decorator that wraps the same local and Supabase repositories and adds
the queue/push/pull logic — the domain and application layers still only
know about the plain `VocabularyRepository` interface.

This syncing behavior applies to **vocabulary only**. Quiz progress and
review history (`progress_state`, `review_records`) are not part of this
sync layer yet — they still follow the simpler mode switch below (fully
local in standalone offline mode, Supabase-only in cloud mode).

## Standalone offline mode (no account at all)

Separately, the app can also run **with no backend whatsoever** — no
Supabase project, no sign-in, nothing pushed anywhere. Set in `.env`:

```
VITE_APP_MODE=offline
```

In this mode:
- Vocabulary, progress, and review history are all stored in the
  browser's `localStorage` (`infrastructure/local/LocalStorageVocabularyRepository.ts`
  and `LocalStorageProgressRepository.ts`) instead of Supabase — and
  nothing ever syncs, since there's no account to sync to.
- There's no login screen — a stable random id is generated once and
  stored locally to stand in for a "user", so per-user progress tracking
  still works the same way (`infrastructure/local/localIdentity.ts`).
- The nav bar shows an "Offline mode" badge and hides the sign-out button,
  since there's no account to sign out of, and no sync status is shown.
- The Supabase client is never called in this mode (it's still
  constructed harmlessly, but no method on it ever runs), so there's no
  missing-env-var warning either.

Use this for a single-device, no-account setup where you never want any
data to leave the browser. For everything else — including working
offline sometimes but keeping data backed up and available on other
devices — just use the default cloud mode described above.

`VITE_APP_MODE` is read at build time (same as the Supabase variables),
so switching modes means updating `.env` and restarting `npm run dev` (or
rebuilding for production) — it's not a runtime toggle in the UI.

## Multi-language support

The app UI and vocabulary translations support multiple languages. **Persian
(فارسی) is the default**, with English as the fallback and second supported
language. A language switcher in the top nav lets the user change it anytime
(persisted in the browser). Persian mode automatically switches the whole
app to right-to-left (RTL) layout with a Persian-friendly font.

Under the hood (`domain/entities/Language.ts`):
- `SUPPORTED_LANGUAGES` lists every language code the app knows
- `DEFAULT_LANGUAGE` is `"fa"`
- Adding a new language means: add its code there, add a matching UI-string
  object to `presentation/i18n/translations.ts`, and add translations for
  that language to your vocabulary JSON — no other code changes needed.

Each vocabulary entry's `translations` and each example sentence's
`translations` are now objects keyed by language code (e.g.
`{ "fa": [...], "en": [...] }`) rather than a plain English array. A word
only needs one language filled in; if the currently selected language is
missing for a word, the app falls back to English, then to whatever
language is present, so partially-translated data never breaks the UI.

## Setup

**Cloud mode** (Supabase-backed, multi-device):

1. **Create a Supabase project** at https://supabase.com.
2. **Run the schema**: open the SQL editor in your Supabase project and run
   the contents of `supabase/schema.sql`. This creates the
   `vocabulary_entries`, `progress_state`, and `review_records` tables with
   row-level security so each user only sees their own progress.
3. **Configure environment variables**:
   ```
   cp .env.example .env
   ```
   Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from your
   Supabase project settings (Project Settings → API). Leave
   `VITE_APP_MODE=cloud` (the default).
4. **Install and run**:
   ```
   npm install
   npm run dev
   ```
5. Open the app, sign up with an email/password, then go to the
   **Vocabularies** tab and import `data/vocabulary.sample.json` (via the
   **Import JSON** button) to load the starter word set (66 B1 words:
   weekdays, months, times of day, and a batch of alphabetical entries
   with full noun/verb forms, translations, and example sentences).

**Offline mode** (no backend at all):

1. `cp .env.example .env` and set `VITE_APP_MODE=offline` — the Supabase
   variables can stay blank.
2. `npm install && npm run dev` — the app opens straight into the quiz
   settings screen, no sign-up needed.
3. Go to **Vocabularies** and import `data/vocabulary.sample.json` as above.

## Managing vocabulary

The **Vocabularies** page is the full management view for your word list:

- A live **count** of how many words you have, and a **search box** that
  filters by headword or translation as you type.
- Words are listed **alphabetically, grouped by starting letter**.
- Hover a row to reveal **edit** and **delete** icons; tap the row itself
  to open a **details dialog** with the word's full info and its own
  Edit/Delete buttons. Dialogs close on **Escape**, on their **✕** button,
  or by clicking outside them.
- **Add word** opens the same dialog in "create" mode — a form covering
  word type, headword, translations, noun/verb forms (shown only when
  relevant), one example sentence with its translations, level, and tags.
  It reuses the same validation and duplicate-detection as JSON import.
- **Import JSON** works as before — upload a file matching
  `data/vocabulary.schema.json`.
- **Delete all** clears every word, locally and (if online) on Supabase
  too, after a confirmation prompt.
- Importing or adding a word that already exists (same word type +
  headword, case-insensitive, under a *different* id) is skipped and
  reported rather than creating a duplicate; re-importing a word under
  its *own* existing id is treated as an edit, not a duplicate.

## Extending the vocabulary

Vocabulary is imported as JSON, validated against
`data/vocabulary.schema.json`. Each entry needs:

- a stable, unique `id` (never change this once imported — it's how
  progress is tracked across re-imports)
- `wordType`, `headword`, `sentences`
- `translations`: an object keyed by language code, e.g.
  `{ "fa": ["خانه"], "en": ["house"] }` — at least one language required
- `nounForms` (article + plural) for nouns
- `verbForms` (present/past/perfect/passive, separable, auxiliary) for verbs
- each sentence needs `german` plus a `translations` object (same
  per-language shape, e.g. `{ "fa": "...", "en": "..." }`)

Importing a file with an `id` that already exists updates that entry in
place rather than duplicating it, so you can safely re-import a growing
vocabulary file over time. A different `id` with the same word type and
headword is treated as a genuine duplicate and skipped instead — see
"Managing vocabulary" above. See `data/vocabulary.sample.json` for real,
filled-in examples of every field.

## How the quiz picks questions

Before each session, a **settings screen** lets you configure:

- **Number of questions** (10–200). If the vocabulary — or the letter-filtered
  subset of it — has fewer words than that, the whole set is used instead.
- **Direction**: German → target language, target language → German, or a mix
  of both.
- **Starting-letter filter** (optional): enter a "from" letter to restrict the
  session to words starting with it. Leave "to" empty and the checkbox
  unchecked and it's a focused single-letter session — every matching word is
  included, ignoring the question-count cap entirely. Fill in "to" (or check
  "Through Z") and it becomes an inclusive letter *range* instead, which
  respects the normal question-count cap. Letter inputs only accept a single
  letter — typing more just keeps the last character typed.
- **Sentence-writing toggle**: include or exclude "compose a sentence"
  questions from the rotation.

Word selection itself is priority-ordered (see
`domain/services/VocabularySelectionService.ts`):
1. Words you've previously rated **very bad, bad, or good** always come
   first, so you keep practicing what you struggle with, every session.
2. Words you've **never seen** fill the rest of the quota.
3. Words you've rated **easy or very easy** are held back entirely — they
   only get pulled in if there aren't enough unseen words left to fill the
   quota, i.e. once you've worked through the rest of the vocabulary.

Single-letter sessions bypass all of this and simply include everything
matching that letter, since the point is focused review of one letter.

## The 5-level difficulty rating

There's no typed answer to check. For each question the word (or, for
"compose a sentence" questions, a prompt) is shown, an optional hint is
available — a German example sentence with its translation, hidden until
you tap "Show hint" — and you rate yourself directly on a 5-level scale:
**very easy, easy, good, bad, very bad**.

- Rate it **good, easy, or very easy** and the app moves straight to the
  next question — no interruption.
- Rate it **bad or very bad** and the app reveals the correct answer (and
  opens the hint automatically) before you continue, so you see what you
  missed right away.

This rating maps onto the SM-2 spaced-repetition algorithm's 0–5 quality
scale, which determines how soon the word resurfaces: easier ratings push
the next review further out; "bad"/"very bad" resets the word to be
reviewed again the next day. Your rating is stored per-question in
`review_records`, and the most recent rating per word is also cached on
`progress_state.last_rating`, which is what the next-session word
selection reads from.

## Error handling

Errors are normalized into a single typed shape (`domain/errors/AppError.ts`)
so the UI never shows a raw stack trace or a cryptic Supabase message:

- **Infrastructure layer** (`infrastructure/supabase/supabaseErrors.ts`)
  translates raw Supabase/network failures into an `AppError` with a
  `code` (`network`, `auth`, `validation`, `storage`, `unknown`) and a
  plain-language `message` — e.g. a dropped connection becomes "Can't
  reach the server. Check your internet connection and try again."
  instead of a fetch exception. The local-storage repositories do the
  same for things like a full browser storage quota.
- **Pages** (Quiz, Dashboard, Vocabularies) catch errors from use-case
  calls, show an inline `ErrorBanner` with the message, and offer a
  **Retry** button that re-runs the exact action that failed — reloading
  the quiz, reloading stats, or reloading the vocabulary list — without
  losing your place (e.g. a failed rating during a quiz reverts to
  unselected so you can just tap it again).
- **`AppErrorBoundary`** wraps the whole app and catches any unexpected
  render-time crash with a friendly "Something went wrong" screen and a
  reload button, instead of a blank white page.
- **`ConnectivityBanner`** shows a small warning banner when the browser
  itself goes offline while running in cloud mode (not shown in offline
  mode, where no connection is expected in the first place).

## Testing

```
npm test
```

Covers the spaced-repetition scheduling math, quiz-question selection and
prioritization (including the letter-range filter and rating-based
priority ordering), JSON import validation and duplicate detection, the
offline local-storage repositories, the offline-first sync repository
(queuing, push-before-pull resync, failure handling), and the
error-normalization logic — the core business logic, independent of the
UI or database.

## Project status

This is a working base project, intentionally scoped to a solid starter
vocabulary set rather than the full ~2,400-word Goethe B1 list, so the
architecture and features could be verified end-to-end first. Extending
the vocabulary set is just a matter of adding more entries to a JSON file
matching the schema — no code changes required.
