import { useEffect, useRef, useState } from "react";
import { LanguageCode, SUPPORTED_LANGUAGES, UI_LANGUAGES, UiLanguage, languageLabel } from "@domain/entities/Language";
import { DIFFICULTY_RATINGS, DifficultyRating } from "@domain/entities/Learning";
import {
  FontSizePreference,
  normalizePreferences,
  MAX_ADVANCE_DELAY_SECONDS,
  MIN_ADVANCE_DELAY_SECONDS,
  Preferences,
  RatingBehavior,
  ThemePreference,
  clampAdvanceDelay,
} from "@domain/entities/Preferences";
import { DISPLAY_NAME_MAX } from "@domain/entities/Profile";
import { useLanguage } from "@presentation/context/LanguageContext";
import { useProfile } from "@presentation/context/ProfileContext";
import { useErrorMessage } from "@presentation/hooks/useErrorMessage";
import { applyAppearance } from "@presentation/appearance";
import { canSpeak, speak } from "@presentation/speech";
import { playCue } from "@presentation/sound";
import { canVibrate, vibrate } from "@presentation/haptics";
import SignOutButton from "@presentation/components/SignOutButton";
import ErrorBanner from "@presentation/components/ErrorBanner";
import RatingPill from "@presentation/components/RatingPill";
import Icon from "@presentation/components/ui/Icon";
import { Segmented, Switch } from "@presentation/components/ui/Controls";
import { InlineLoader } from "@presentation/components/ui/Loader";
import CollectionPicker from "@presentation/components/CollectionPicker";
import { useCurrentUser } from "@presentation/context/AuthContext";
import { useServices } from "@presentation/context/ServicesContext";
import { useAsync } from "@presentation/hooks/useAsync";

interface Draft {
  displayName: string;
  primaryLanguage: LanguageCode;
  uiLanguage: UiLanguage;
  preferences: Preferences;
}

type SaveState = "idle" | "saving" | "saved" | "error";

/** Wait this long after the last change before saving (lets typing finish). */
const AUTOSAVE_DELAY_MS = 500;

/** What is actually stored: trimmed name and clamped/validated preferences. */
function toPayload(draft: Draft): Draft {
  return { ...draft, displayName: draft.displayName.trim(), preferences: normalizePreferences(draft.preferences) };
}

/** Profile, appearance and quiz behaviour. Every change applies at once and is saved automatically. */
export default function SettingsPage() {
  const { profile, updateProfile } = useProfile();
  const user = useCurrentUser();
  const { vocabularies, sentenceCollections } = useServices();
  const library = useAsync(() => vocabularies.listQuizLibrary(user.id), [user.id]);
  const sentenceLibrary = useAsync(() => sentenceCollections.listLibrary(user.id), [user.id]);
  const { t, setLanguage } = useLanguage();
  const errorMessage = useErrorMessage();

  const [draft, setDraft] = useState<Draft>(() => ({
    displayName: profile.displayName,
    primaryLanguage: profile.primaryLanguage,
    uiLanguage: profile.uiLanguage,
    preferences: profile.preferences,
  }));
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  const lastSavedKey = useRef(JSON.stringify(toPayload(draft)));
  const pending = useRef<Draft | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const mounted = useRef(true);
  const nameMissing = !draft.displayName.trim();

  // Appearance and app language take effect immediately.
  useEffect(() => {
    applyAppearance(draft.preferences);
  }, [draft.preferences.theme, draft.preferences.fontSize, draft.preferences.reduceMotion, draft.preferences.liquidGlass]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setLanguage(draft.uiLanguage);
  }, [draft.uiLanguage, setLanguage]);

  // Save shortly after each change; saves run one at a time, in order.
  useEffect(() => {
    const payload = toPayload(draft);
    const key = JSON.stringify(payload);
    if (key === lastSavedKey.current || !payload.displayName) {
      pending.current = null;
      return;
    }
    pending.current = payload;
    const timer = window.setTimeout(() => {
      pending.current = null;
      setSaveState("saving");
      queue.current = queue.current.then(async () => {
        try {
          await updateProfile(payload);
          lastSavedKey.current = key;
          if (mounted.current) {
            setSaveState("saved");
            setError(null);
          }
        } catch (error) {
          if (mounted.current) {
            setSaveState("error");
            setError(errorMessage(error, "profileSaveError"));
          }
        }
      });
    }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving the page right after a change still saves it.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (pending.current) updateProfile(pending.current).catch(() => {});
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setPref = <K extends keyof Preferences>(key: K, value: Preferences[K]) =>
    setDraft((draft) => ({ ...draft, preferences: { ...draft.preferences, [key]: value } }));
  const setBehavior = (rating: DifficultyRating, patch: Partial<RatingBehavior>) =>
    setDraft((draft) => ({
      ...draft,
      preferences: {
        ...draft.preferences,
        ratingBehavior: { ...draft.preferences.ratingBehavior, [rating]: { ...draft.preferences.ratingBehavior[rating], ...patch } },
      },
    }));

  const preferences = draft.preferences;

  return (
    <div className="app-main settings-page">
      <div className="page-header">
        <h2>{t("navSettings")}</h2>
        {saveState !== "idle" && (
          <span className={`save-status ${saveState}`} role="status" key={saveState}>
            {saveState === "saving" && (
              <>
                <Icon name="refresh" size={14} className="spin" /> {t("saving")}
              </>
            )}
            {saveState === "saved" && (
              <>
                <Icon name="check" size={14} /> {t("settingsSaved")}
              </>
            )}
            {saveState === "error" && (
              <>
                <Icon name="close" size={14} /> {t("notSaved")}
              </>
            )}
          </span>
        )}
      </div>
      {error && <ErrorBanner message={error} />}

      <section className="card">
        <h3 className="card-title">
          <Icon name="globe" /> {t("settingsProfile")}
        </h3>
        <div className="form-field">
          <label htmlFor="st-name">{t("displayNameLabel")}</label>
          <input
            id="st-name"
            type="text"
            dir="auto"
            maxLength={DISPLAY_NAME_MAX}
            value={draft.displayName}
            onChange={(event) => setDraft({ ...draft, displayName: event.target.value })}
          />
          {nameMissing ? (
            <p className="field-error">{t("displayNameRequired")}</p>
          ) : (
            <p className="muted form-hint">{t("displayNameHint")}</p>
          )}
        </div>
        <div className="form-row">
          <div className="form-field">
            <label htmlFor="st-primary">{t("primaryLanguageLabel")}</label>
            <select
              id="st-primary"
              value={draft.primaryLanguage}
              onChange={(event) => setDraft({ ...draft, primaryLanguage: event.target.value as LanguageCode })}
            >
              {SUPPORTED_LANGUAGES.map((code) => (
                <option key={code} value={code}>
                  {languageLabel(code)}
                </option>
              ))}
            </select>
            <p className="muted form-hint">{t("primaryLanguageHint")}</p>
          </div>
          <div className="form-field">
            <label htmlFor="st-ui">{t("uiLanguageLabel")}</label>
            <select id="st-ui" value={draft.uiLanguage} onChange={(event) => setDraft({ ...draft, uiLanguage: event.target.value as UiLanguage })}>
              {UI_LANGUAGES.map((code) => (
                <option key={code} value={code}>
                  {languageLabel(code)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="card">
        <h3 className="card-title">
          <Icon name="sun" /> {t("settingsAppearance")}
        </h3>
        <div className="form-field">
          <span className="field-label">{t("themeLabel")}</span>
          <Segmented<ThemePreference>
            ariaLabel={t("themeLabel")}
            value={preferences.theme}
            onChange={(theme) => setPref("theme", theme)}
            options={[
              { value: "system", label: <><Icon name="monitor" size={16} /> {t("themeSystem")}</> },
              { value: "light", label: <><Icon name="sun" size={16} /> {t("themeLight")}</> },
              { value: "dark", label: <><Icon name="moon" size={16} /> {t("themeDark")}</> },
            ]}
          />
        </div>
        <div className="form-field">
          <span className="field-label">{t("fontSizeLabel")}</span>
          <Segmented<FontSizePreference>
            ariaLabel={t("fontSizeLabel")}
            value={preferences.fontSize}
            onChange={(fontSize) => setPref("fontSize", fontSize)}
            options={[
              { value: "small", label: <span style={{ fontSize: "0.8em" }}>{t("fontSmall")}</span> },
              { value: "medium", label: t("fontMedium") },
              { value: "large", label: <span style={{ fontSize: "1.1em" }}>{t("fontLarge")}</span> },
              { value: "xlarge", label: <span style={{ fontSize: "1.2em" }}>{t("fontXLarge")}</span> },
            ]}
          />
        </div>
        <Switch
          checked={preferences.liquidGlass}
          onChange={(isChecked) => setPref("liquidGlass", isChecked)}
          label={
            <span className="icon-text">
              <Icon name="sparkles" size={18} /> {t("liquidGlassLabel")}
            </span>
          }
          description={t("liquidGlassHint")}
        />
        <Switch
          checked={preferences.reduceMotion}
          onChange={(isChecked) => setPref("reduceMotion", isChecked)}
          label={t("reduceMotionLabel")}
          description={t("reduceMotionHint")}
        />
      </section>

      <section className="card">
        <h3 className="card-title">
          <Icon name="check" /> {t("settingsAfterAnswer")}
        </h3>
        <p className="muted">{t("settingsAfterAnswerHint")}</p>
        <div className="behavior-list">
          {DIFFICULTY_RATINGS.map((rating) => {
            const behavior = preferences.ratingBehavior[rating];
            return (
              <div key={rating} className="behavior-item">
                <RatingPill rating={rating} />
                <Switch checked={behavior.showAnswer} onChange={(isChecked) => setBehavior(rating, { showAnswer: isChecked })} label={t("showAnswerLabel")} />
                <Switch
                  checked={behavior.autoAdvance}
                  onChange={(isChecked) => setBehavior(rating, { autoAdvance: isChecked })}
                  label={t("autoAdvanceLabel")}
                  description={!behavior.showAnswer && behavior.autoAdvance ? t("autoAdvanceImmediate") : undefined}
                />
                {behavior.autoAdvance && behavior.showAnswer && (
                  <label className="inline-field delay-field">
                    <span>{t("advanceDelayLabel")}</span>
                    <input
                      type="number"
                      min={MIN_ADVANCE_DELAY_SECONDS}
                      max={MAX_ADVANCE_DELAY_SECONDS}
                      step={0.5}
                      value={behavior.delaySeconds}
                      onChange={(event) => setBehavior(rating, { delaySeconds: Number(event.target.value) })}
                      onBlur={(event) => setBehavior(rating, { delaySeconds: clampAdvanceDelay(Number(event.target.value), 5) })}
                    />
                    <span className="muted">{t("secondsShort")}</span>
                  </label>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h3 className="card-title">
          <Icon name={preferences.soundEffects ? "volume" : "volumeOff"} /> {t("settingsSounds")}
        </h3>
        <Switch
          checked={preferences.soundEffects}
          onChange={(isChecked) => {
            setPref("soundEffects", isChecked);
            if (isChecked) playCue("success", preferences.soundVolume);
          }}
          label={t("soundEffectsLabel")}
          description={t("soundEffectsHint")}
        />
        {preferences.soundEffects && (
          <div className="slider-row">
            <label htmlFor="st-volume">{t("soundVolumeLabel")}</label>
            <input
              id="st-volume"
              className="range"
              type="range"
              min={0.1}
              max={1}
              step={0.1}
              value={preferences.soundVolume}
              onChange={(event) => setPref("soundVolume", Number(event.target.value))}
              onPointerUp={() => playCue("success", preferences.soundVolume)}
              onKeyUp={() => playCue("success", preferences.soundVolume)}
            />
            <button type="button" className="icon-btn bordered" onClick={() => playCue("success", preferences.soundVolume)} aria-label={t("testSound")} title={t("testSound")}>
              <Icon name="volume" size={18} />
            </button>
          </div>
        )}
        {canVibrate() && (
          <Switch
            checked={preferences.haptics}
            onChange={(isChecked) => {
              setPref("haptics", isChecked);
              if (isChecked) vibrate("success");
            }}
            label={t("hapticsLabel")}
            description={t("hapticsHint")}
          />
        )}
      </section>

      <section className="card">
        <h3 className="card-title">
          <Icon name="mic" /> {t("settingsPronunciation")}
        </h3>
        <Switch
          checked={preferences.autoPronounce}
          onChange={(isChecked) => setPref("autoPronounce", isChecked)}
          label={t("autoPronounceLabel")}
          description={canSpeak() ? t("autoPronounceHint") : t("speechUnsupported")}
          disabled={!canSpeak()}
        />
        {canSpeak() && (
          <div className="slider-row">
            <label htmlFor="st-rate">{t("speechRateLabel")}</label>
            <input
              id="st-rate"
              className="range"
              type="range"
              min={0.5}
              max={1.5}
              step={0.1}
              value={preferences.speechRate}
              onChange={(event) => setPref("speechRate", Number(event.target.value))}
            />
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={() => speak("Guten Morgen", "de", preferences.speechRate)}
            >
              <Icon name="volume" size={16} /> {t("testSpeech")}
            </button>
          </div>
        )}
      </section>

      <section className="card">
        <h3 className="card-title">
          <Icon name="quiz" /> {t("settingsQuiz")}
        </h3>
        <div className="form-field">
          <span className="field-label">{t("defaultVocabulariesLabel")}</span>
          {library.data ? (
            <CollectionPicker
              kind="vocabulary"
              items={library.data}
              selected={preferences.defaultVocabularyIds.filter((id) => library.data!.some((vocabulary) => vocabulary.id === id))}
              onChange={(ids) => setPref("defaultVocabularyIds", ids)}
              currentUserId={user.id}
              placeholder={t("noDefaultVocabulary")}
            />
          ) : library.error ? (
            <p className="muted small">{t("errorOffline")}</p>
          ) : (
            <InlineLoader />
          )}
          <p className="muted form-hint">{t("defaultVocabulariesHint")}</p>
        </div>
        <Switch checked={preferences.autoShowHint} onChange={(isChecked) => setPref("autoShowHint", isChecked)} label={t("autoShowHintLabel")} description={t("autoShowHintHint")} />
        <Switch
          checked={preferences.keyboardShortcuts}
          onChange={(isChecked) => setPref("keyboardShortcuts", isChecked)}
          label={t("keyboardShortcutsLabel")}
          description={t("keyboardShortcutsHint")}
        />
      </section>

      <section className="card">
        <h3 className="card-title">
          <Icon name="sentence" /> {t("settingsSentences")}
        </h3>
        <div className="form-field">
          <span className="field-label">{t("defaultSentenceCollectionsLabel")}</span>
          {sentenceLibrary.data ? (
            <CollectionPicker
              kind="sentenceCollection"
              items={sentenceLibrary.data}
              selected={preferences.defaultSentenceCollectionIds.filter((id) => sentenceLibrary.data!.some((collection) => collection.id === id))}
              onChange={(ids) => setPref("defaultSentenceCollectionIds", ids)}
              currentUserId={user.id}
              placeholder={t("noDefaultVocabulary")}
            />
          ) : sentenceLibrary.error ? (
            <p className="muted small">{t("errorOffline")}</p>
          ) : (
            <InlineLoader />
          )}
          <p className="muted form-hint">{t("defaultSentenceCollectionsHint")}</p>
        </div>
        <Switch
          checked={preferences.sentenceTolerateTypos}
          onChange={(isChecked) => setPref("sentenceTolerateTypos", isChecked)}
          label={t("sentenceTolerateTyposLabel")}
          description={t("sentenceTolerateTyposHint")}
        />
        <Switch
          checked={preferences.sentenceAutoShowHint}
          onChange={(isChecked) => setPref("sentenceAutoShowHint", isChecked)}
          label={t("sentenceAutoShowHintLabel")}
          description={t("sentenceAutoShowHintHint")}
        />
        <Switch
          checked={preferences.sentenceDistractors}
          onChange={(isChecked) => setPref("sentenceDistractors", isChecked)}
          label={t("sentenceDistractorsDefaultLabel")}
          description={t("sentenceDistractorsHint")}
        />
      </section>

      <section className="card">
        <h3 className="card-title">
          <Icon name="book" /> {t("settingsWords")}
        </h3>
        <Switch checked={preferences.continuousAdd} onChange={(isChecked) => setPref("continuousAdd", isChecked)} label={t("keepAddingLabel")} description={t("keepAddingHint")} />
      </section>

      <section className="card">
        <h3 className="card-title">
          <Icon name="logout" /> {t("settingsAccount")}
        </h3>
        {user.email && (
          <p className="muted" dir="auto">
            {t("signedInAs", { email: user.email })}
          </p>
        )}
        <SignOutButton className="btn btn-secondary danger-text btn-block" withLabel />
      </section>

    </div>
  );
}
