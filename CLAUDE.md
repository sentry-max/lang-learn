# Lang Learn

Spaced-repetition vocabulary trainer (German, English, Persian). React 18 + TypeScript + Vite, React
Router, Supabase (Postgres, Auth, RLS), Vitest. State lives in React state and contexts; there is no
state library. Words can be used offline while the tab stays open (`src/infrastructure/offline/`).
UI strings live in `src/presentation/i18n/translations.ts`. `README.md` explains the product rules.

## Architecture rules

1. **Clean architecture and SOLID.** Each module has one job, and dependencies point inwards only:

   ```
   src/
     domain/          entities, repository interfaces, pure business rules. Imports only domain.
     application/     services, use cases and ports over the domain. Imports domain and application.
     infrastructure/  Supabase repositories and gateways, caches, offline queue.
     presentation/    React pages, components, hooks, contexts, UI strings.
   ```

   `domain/` and `application/` never import React, Supabase or `presentation/`. Implementations are
   wired together only in the composition roots: `presentation/context/ServicesContext.tsx` and
   `presentation/context/AuthContext.tsx`. These are the only `presentation/` files that may import
   `infrastructure/`.

2. **All Supabase calls live in `infrastructure/supabase/`.** Nothing else imports `@supabase/supabase-js`
   or the `supabase` client. Each class implements an interface from `domain/repositories/` or
   `application/ports/`, and turns rows into entities. Database changes go in `supabase/schema.sql`,
   which must stay safe to re-run, and data moves go in `supabase/migrations/`.

3. **Repositories only store and read the app's own data**, and their file names contain `Repository`
   (`SupabaseWordRepository`, `OfflineVocabularyRepository`). Anything else is a service, use case or
   gateway (`WordService`, `GenerateQuizUseCase`, `SupabaseAuthGateway`, `SyncGateway`).

4. **Business rules are pure functions in `domain/services/`.** They take data and return data, so they
   are tested without React or a database (`QuizSelectionService`, `SpacedRepetitionService`,
   `GermanInflection`). Anything random takes a `RandomSource` so tests can seed it.

5. **Keep logic out of the UI.** Components lay out state and forward user events. Decisions, validation,
   calculations and parsing belong in `domain/` or `application/`. A page may coordinate its own screen:
   call a service, hold its result in state, navigate, open a dialog. If a component starts deciding
   what is correct, move that decision inwards.

6. **Derive, don't store.** If a value can be worked out from stored data, work it out where it is read.
   Word inflections are the example: `inflectWord` builds every tense and case from the principal parts
   already on the word, so no table or migration is needed and old words get the feature too.

7. **A type used by an entity goes in that entity's file**, at the top (`WordType` in `Word.ts`), and so
   do helpers that operate on it (`displayForm` in `Word.ts`). Don't create a separate file for them.

8. **Comment only the why the code cannot show, in one short line** (two when the why needs it). Don't
   comment obvious code. A shortcut with a known limit says so: `// shortcut: <the limit>, <when to upgrade>`.

9. **No abbreviations in names.** Write variables, parameters, fields, types and files out in full so a
   person can read them: `index` not `i`, `event` not `e`, `error` not `err`, `word` not `w`,
   `deltaX` not `dx`, and `(vocabulary) => vocabulary.id` not `(v) => v.id`. Exceptions: names you don't
   control (browser, React or package APIs), `id`, `app`, `t` (the translate function), `ref`,
   `a`/`b` in sort comparators, `_` for an unused parameter, `x`/`y` coordinates, and a `Ms` suffix for
   milliseconds (`advanceTotalMs`).

10. **Name things by what they are used for, so a reader never has to find the usages to understand a
    name.** Two or three plain words, no longer.
    - Name a value by its job, not by its type or how it looks: `mutedTextColor` not `muted`,
      `wordRepository` not `repository` when there are several around.
    - Name a ref with its type at the end: `headwordInputRef`, `fileInputRef`.
    - Name a `Map` or `Record` `<values>By<Key>`: `progressByWordId`. Name an array or `Set` with a
      plural: `vocabularyIds`.
    - Name a `boolean` as a yes/no statement: `isOwner`, `hasOffers`, `canPronounce`.
    - Name a callback prop `on<Event>` (`onDetailsTapped`) and a function that handles it by what it
      does (`requestExit`, `toggleDownload`).
    - Name a union for the choice it makes and its members for the choices: `QuizDirection`.

11. **Components and hooks.** One exported component per concern, in a `PascalCase.tsx` file; a small
    helper component may share the file. Pages go in `presentation/pages/`, shared components in
    `presentation/components/`, and generic controls in `presentation/components/ui/`. Reuse them before
    writing new ones: `Modal`, `ErrorBanner`, `Spinner`, `PageLoader`, `Switch`, `Segmented`, `MenuSelect`,
    `Icon`, and the hooks `useAsync`, `useErrorMessage`, `useDeadline`. Dialogs are built on `Modal`.

12. **Screen state, in order of preference.** Plain `useState` for one component. A discriminated union
    instead of several booleans that can combine into states that make no sense
    (`type Stage = "settings" | "loading" | "running" | "done" | "empty"`). A context only for what
    many distant components need (auth, profile, language, services).

13. **Clean up async work.** Whoever starts a timer, listener or subscription stops it in the effect's
    cleanup. An async result that may arrive after the screen changed is ignored (see the `runId` in
    `useAsync` and `active` in `AuthContext`). Timer callbacks read current values through a ref.

14. **A button that sends a request runs it once and shows that it is working.** Users tap again and
    again on a slow network, and every tap must not become another request.
    - Set the in-progress state before the request and disable the button with it. `disabled` is what
      stops the second tap, and it also blocks Enter on a form. A flow fired from timers or the keyboard
      also guards with a ref (`savingRef` in `QuizPage`).
    - Change the label or show a `Spinner` on the submit button, and block anything that would change or
      repeat the same request: closing the dialog, cancelling, a second submit button.
    - Handle every outcome: success, server error, no network. On failure, leave the in-progress state,
      keep what the user entered, show a translated message and let them try again. Use
      `try`/`finally` so a button never spins forever.

15. **Errors carry reasons, not sentences.** `domain/` and `application/` never build text the user will
    read. They return or throw a code (`AppError` with a `reason`, `WordProblem`, `AuthFailure`), and
    `presentation/` translates it (`useErrorMessage`, `describeWordProblem`). `error.message` is for
    developers and never reaches the screen.

16. **Writes must survive being offline.** Answers go through the outbox, and each write must be
    idempotent on the server, so a retry never double-counts. Everything else that needs a connection
    fails with the `offline` reason. Never hard-delete: the API role has no `DELETE` privilege, and
    deleting sets `deleted_at`.

17. **Validate at the boundary.** Imported JSON, form input and stored JSON columns are untrusted:
    `parseWordInput` and the `normalize*` helpers clean them before they reach the app. Rules that must
    hold for everyone are enforced in the database as well, with triggers and RLS, not only in the UI.

18. **Works on a phone.** The layout must work from 320px wide, one-handed, with no horizontal scroll.
    Main actions sit within thumb reach, tap targets are at least 44px, and styles support light, dark,
    RTL and the Liquid Glass style. Use logical CSS properties (`margin-inline-end`, `text-align: start`)
    and CSS variables, not fixed colors. Text in a source language gets `dir="auto"` or `dir="ltr"`.

19. **The smallest change that fully solves the task.** Take the first option that works:
    - Skip features, options and flexibility nobody asked for. No abstraction, wrapper, config or
      "for later" code without a second user.
    - Reuse what the app already has before writing anything. Never copy a component or a block of code;
      extend the existing one instead.
    - Then the browser or TypeScript itself, then an installed package. Never add a dependency for a few
      lines.
    - Finish every part the change touches: callers, tests and fixtures. Fix a bug once, in the shared
      code, after finding every caller. Code you move keeps its error handling and validation.
    - Never cut validation of user input, error handling that prevents data loss, security or
      accessibility.

## Word inflections

Every word shows all of its forms when the answer is revealed in a quiz and in the word dialog. Any new
feature that shows, edits, imports, exports or quizzes words must keep this working and follow the rules
below.

### Where it lives

| File | Job |
|---|---|
| `domain/entities/Inflection.ts` | The result types: `WordInflection`, `TenseTable`, `CaseForms`, `PronounCases`, `TenseName` |
| `domain/services/WordInflectionService.ts` | `inflectWord(word, sourceLanguage)`, the only entry point. Picks the language and drops blank data |
| `domain/services/GermanInflection.ts` | German verbs (tenses, persons, reflexives, pronouns) and nouns (cases, articles, n-declension) |
| `domain/services/EnglishInflection.ts` | English verbs (12 tenses, conditionals, imperative, passive, modals) and plurals (irregular, uncountable) |
| `domain/services/PluralNotation.ts` | `expandPlural`: dictionary notation (`-e`, `¨-er`, `-`) to the full plural |
| `presentation/components/WordInflections.tsx` | Shows the result. Never works out a form itself |
| `presentation/i18n/grammarLabels.ts` | Translation keys for tenses, cases, parts and word types |

UI code calls `inflectWord` and nothing else from these files. Never build or change a word form in a
component.

### What is shown

- **German verbs**
  - The principal parts: infinitive, er form, Präteritum, Partizip II, auxiliary, Partizip I.
  - Tense tables: Präsens, Präteritum, Perfekt, Plusquamperfekt, Futur I and II, Konjunktiv I and II
    (and its past), Imperativ (du, ihr, Sie), and the passive when the word has one.
  - **Every tense has nine persons, in this order: ich, du, er, sie, es, wir, ihr, sie, Sie.** The forms are
    built for six persons (`SixForms`) and spread over nine rows by `PERSONS`. Add a tense as `SixForms`
    and pass it to `build`. Never hand-write nine rows or bring back `er/sie/es`.
  - Reflexive verbs put the pronoun after the finite verb (`amüsiere mich`, `hat sich amüsiert`). It is
    dative (`mir`, `dir`) when the headword also names an object (`sich etwas merken`) and accusative
    (`mich`, `dich`) otherwise.
  - Separable verbs split in simple tenses (`fange an`) and stay whole in compound ones (`habe angefangen`).
  - The personal pronouns in the nominative, accusative and dative for all nine persons (`GERMAN_PRONOUNS`:
    `ich · mich · mir` … `Sie · Sie · Ihnen`), shown as a collapsible table.
  - Modal verbs have no imperative. Irregular verbs (`sein`, `haben`, `werden`, `tun`, `wissen`, the modals)
    use their stored tables in `IRREGULAR_VERBS`.
- **German nouns**: the plural, then nominative, accusative and dative, in the singular and plural, each
  with the definite, indefinite and negative article (`den Studenten · einen Studenten · keinen
  Studenten`). Includes the n-declension and the dative plural `-n`. The plural has no indefinite article.
- **English verbs**: principal parts and all tenses for six persons (I, you, he/she/it, we, you, they). Their
  `pronouns` list is empty.
- **English nouns**: the plural. Uncountable nouns (`information`, `advice`) have none.
- **Persian**: a stored plural only. Persian verbs show no forms.
- The German genitive is left out on purpose: the app shows the nominative, accusative and dative.

### Derived, not stored

- Forms are worked out at read time from what the word already stores: `nounForms.article`,
  `nounForms.plural` and the `verbForms` principal parts. There is no inflection table and no migration,
  and old words get every new form automatically.
- **Stored forms always win over derived ones.** Rules only fill in what is missing.
- Don't add a database column or JSON field for a form that can be derived. Add a field only when the form
  can't be derived (an irregular form, the case a reflexive takes), and then also update
  `data/vocabulary.schema.json`, `parseWordInput`, both sample files and the word form dialog.

### Missing data is normal

Any field can be missing, `null`, an empty string or only spaces, in imported JSON and in old rows. The app
must never crash and never show an empty label, row, table or section.

- `inflectWord` returns `null` when there is nothing to show: a blank headword, a type with no forms, or a
  noun with no article and no plural. It drops blank forms, empty rows and empty tables.
- A form that depends on a missing field is left out, not guessed: no simple past means no Präteritum, and
  no Partizip II means no Perfekt, Plusquamperfekt, Futur II or passive. Forms that come from the headword
  alone (Präsens, Futur I, Konjunktiv) are still shown.
- In the UI, render a section only when it has content: `{list.length > 0 && …}` and `{text && …}`. This
  covers meanings, sentences, sentence translations and tags too.
- Every new list or text in `WordInflection` must be safe when empty, and the UI must hide it when it is.

### Rules for changes

- **Grammar comes before convenience.** A wrong form teaches a mistake. For every rule or exception you add,
  add a test whose expected form comes from a dictionary.
- The test suite runs every entry of `data/vocabulary.sample.json` and `data/vocabulary.sample.en.json`
  through `parseWordInput` and `inflectWord`, and fails on any blank form. When you add a kind of word or
  form, add an example to the matching sample.
- A rule with a known limit carries a `shortcut:` comment. Current limits: weak nouns are recognised by
  ending; adjectival nouns (`der Angestellte`) use the plain table; the dative reflexive is detected only by
  `etwas`/`etw.` in the headword; English uncountables come from a fixed list.
- A new tense, case or part name must be added to its union in `Inflection.ts`, to `grammarLabels.ts` and
  to both languages in `translations.ts`. TypeScript fails if one is missing.
- Forms are in the word's own language and get `dir="ltr"`. Only the labels around them are translated.
- Tables must fit at 320px: rows stack or wrap and never scroll sideways. Long tense lists go in collapsible
  `<details>` sections, with only the first one open.

## Localization

Interface languages: English (the reference, its keys define `UiStringKey`) and Persian (the default, RTL).

- **No user-facing string in code.** Text, labels, placeholders, `aria-label`, `title`, toasts, dialogs and
  error messages all come from `translations.ts` through `t("key")`. The only exceptions are things that
  are never translated: grammar forms in the word's own language (`ich`, `der`), language names, emoji and
  symbols. Strings in `throw new Error` for developers and in tests stay in code.
- **`t` comes from `useLanguage()`.** Code outside a component takes `t` as a parameter
  (`describeWordProblem(t, problem)`). `domain/` and `application/` never format user-facing text (rule 15).
- **Keys** are camelCase and start with the feature or screen (`wordProblemHeadwordMissing`,
  `tensePresent`). Name a key by what the text is for, never `text1` or `label`.
- **Map identifiers to keys with a `Record`**, as in `i18n/grammarLabels.ts`, so a new value that has no
  text is a type error.
- **Add a string to both languages in the same change.** TypeScript fails if Persian misses a key. When you
  change a text's meaning, update both; when you remove a feature, remove its keys from both.
- **Dynamic text uses placeholders, never concatenation:** `t("questionOf", { current, total })`.
- **Numbers and dates** go through `presentation/format.ts`, so Persian shows Persian digits.
- **Check text length.** Text must fit at 320px wide in both languages, or wrap or ellipsize.
- **Finding hardcoded strings:**
  `grep -rnE ">[A-Z][a-z]+ ?[a-z]*<|(title|label|placeholder|aria-label)=\"[A-Za-z]" src/presentation --include=*.tsx`

## Testing

- **Layout.** A test sits next to its code as `<Name>.test.ts`. Group related tests with `describe`.
- **No mocking library.** Replace dependencies with the in-memory ports in
  `src/test/inMemoryRepositories.ts` and the data in `src/test/fixtures.ts`. A fake used by one test file
  stays in that file.
- **Time and randomness.** Never wait on real timers: use Vitest's fake timers. Pass a seeded
  `RandomSource` to anything random.
- **No real I/O.** Never call Supabase or the network in a test.
- **Test names** say the behavior as a plain sentence: `'splits a separable verb in every simple tense'`.
- **What to cover:** one good test for each piece of risky logic, not coverage: a branch, a parser, grammar
  rules, the quiz algorithm, data writes, the offline outbox. Trivial code needs none. When you fix a bug,
  add a test that fails without the fix.
- **Hygiene.** Each test builds its own state. Production code contains no test-only branches.
- **Layout changes need a real look.** Tests don't see CSS. Check the screen in a browser at 320px, in both
  languages.

## Git

- Branch from `master` as `<your name>/<topic>` (`saied/word-inflections`).
- Commit messages are one short, plain sentence about what changed
  (`quiz answer shows every tense of the verb`).
- Before committing: `npm run lint` reports no problems, `npm run build` succeeds and `npm test` passes.

## Commands

- `npm run dev` starts the app. It needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env`.
- `npm run build` type-checks with `tsc -b` and builds. `npx tsc -b` type-checks alone.
- `npm test` runs everything once. One file: `npx vitest run src/path/Name.test.ts`.
- `npm run lint` must report no problems.
- There is no formatter in this project: match the surrounding code (2 spaces, double quotes, 140 columns).
