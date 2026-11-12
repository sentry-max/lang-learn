import { Link } from "react-router-dom";
import { Conversation, ConversationLineResult, ConversationSetup, MAX_TURNS, MIN_TURNS, SetupProblem, conversationText } from "@domain/entities/Conversation";
import { LanguageCode } from "@domain/entities/Language";
import { assignRole, canAddBot, canSkipBot, defaultSetup, humanCountOptions, validateSetup } from "@domain/services/ConversationPlanner";
import { useLanguage } from "@presentation/context/LanguageContext";
import { Segmented, Switch } from "@presentation/components/ui/Controls";
import MenuSelect from "@presentation/components/ui/MenuSelect";
import Icon from "@presentation/components/ui/Icon";
import { Spinner } from "@presentation/components/ui/Loader";
import RoleHistory from "@presentation/components/conversation/RoleHistory";
import CollectionPicker from "@presentation/components/CollectionPicker";
import { useCurrentUser } from "@presentation/context/AuthContext";
import { UiStringKey } from "@presentation/i18n/translations";
import { formatNumber } from "@presentation/format";

const SETUP_PROBLEM_KEYS: Record<SetupProblem, UiStringKey> = {
  human_count: "conversationSetupHumanCount",
  turn_count: "conversationSetupTurnCount",
  role_unknown: "conversationSetupRoleUnknown",
  role_taken_twice: "conversationSetupRoleTwice",
  required_role_missing: "conversationSetupRequiredMissing",
};

const TURN_CHOICES = Array.from({ length: MAX_TURNS - MIN_TURNS + 1 }, (_, offset) => String(MIN_TURNS + offset));

interface Props {
  /** Own and downloaded conversations to choose from */
  library: Conversation[];
  conversation: Conversation;
  onSelect: (conversationId: string) => void;
  setup: ConversationSetup;
  onChange: (setup: ConversationSetup) => void;
  history: ConversationLineResult[] | undefined;
  primaryLanguage: LanguageCode;
  canRead: boolean;
  canSpeakOut: boolean;
  isStarting: boolean;
  onDemo: () => void;
  onRead: () => void;
}

/** The conversation to read, who reads which role and how many turns, the per-role history, and the two ways to start. */
export default function ConversationSetupPanel(props: Props) {
  const { library, conversation, onSelect, setup, onChange, history, primaryLanguage, canRead, canSpeakOut, isStarting, onDemo, onRead } = props;
  const user = useCurrentUser();
  const { t, language } = useLanguage();
  const problems = validateSetup(conversation, setup);
  const humanCount = setup.humanRoleIds.length;
  const hasBot = setup.botRoleId !== null;
  const roleOptions = conversation.roles.map((role) => ({ value: role.id, label: <span dir="auto">{role.name}</span> }));
  const translated = conversationText(conversation, primaryLanguage);

  return (
    <div className="card start-card">
      <h2 className="card-title">{t("conversationStartTitle")}</h2>

      <section className="start-section">
        <span className="field-label">{t("conversationPickerLabel")}</span>
        <div className="picker-row">
          <CollectionPicker
            kind="conversation"
            items={library}
            selected={[conversation.id]}
            onChange={(ids) => ids[0] && onSelect(ids[0])}
            currentUserId={user.id}
          />
          <Link className="icon-btn bordered" to="/vocabularies?section=conversations" title={t("manageConversations")} aria-label={t("manageConversations")}>
            <Icon name="settings" />
          </Link>
          <Link className="icon-btn bordered" to="/feed?section=conversations" title={t("exploreConversations")} aria-label={t("exploreConversations")}>
            <Icon name="compass" />
          </Link>
        </div>
        {translated.description && (
          <p className="muted small" dir="auto">
            {translated.description}
          </p>
        )}
      </section>

      <section className="start-section">
        <span className="field-label">{t("conversationReadersLabel")}</span>
        <Segmented
          options={humanCountOptions(conversation).map((count) => ({ value: String(count), label: formatNumber(count, language) }))}
          value={String(humanCount)}
          onChange={(count) => onChange(defaultSetup(conversation, Number(count), hasBot, setup.turnsPerSpeaker))}
          ariaLabel={t("conversationReadersLabel")}
        />
      </section>

      <section className="start-section">
        <Switch
          checked={hasBot}
          onChange={(checked) => onChange(defaultSetup(conversation, humanCount, checked, setup.turnsPerSpeaker))}
          label={t("conversationBotLabel")}
          description={t("conversationBotDescription")}
          disabled={!(canAddBot(conversation, humanCount) && canSkipBot(conversation, humanCount))}
        />
      </section>

      <section className="start-section">
        <span className="field-label">{t("conversationRolesLabel")}</span>
        <div className="conversation-seats">
          {setup.humanRoleIds.map((roleId, seat) => (
            <label key={seat} className="conversation-seat">
              <span>{t("conversationReaderNumber", { number: formatNumber(seat + 1, language) })}</span>
              <MenuSelect
                value={roleId}
                options={roleOptions}
                onChange={(next) => onChange(assignRole(setup, seat, next))}
                ariaLabel={t("conversationReaderNumber", { number: formatNumber(seat + 1, language) })}
              />
            </label>
          ))}
          {setup.botRoleId !== null && (
            <label className="conversation-seat">
              <span>{t("conversationBotName")}</span>
              <MenuSelect value={setup.botRoleId} options={roleOptions} onChange={(next) => onChange(assignRole(setup, "bot", next))} ariaLabel={t("conversationBotName")} />
            </label>
          )}
        </div>
      </section>

      <section className="start-section">
        <span className="field-label">{t("conversationTurnsLabel")}</span>
        <Segmented
          options={TURN_CHOICES.map((turns) => ({ value: turns, label: formatNumber(Number(turns), language) }))}
          value={String(setup.turnsPerSpeaker)}
          onChange={(turns) => onChange({ ...setup, turnsPerSpeaker: Number(turns) })}
          ariaLabel={t("conversationTurnsLabel")}
        />
      </section>

      {problems.map((problem) => (
        <p key={problem} className="field-error" role="alert">
          {t(SETUP_PROBLEM_KEYS[problem])}
        </p>
      ))}

      <RoleHistory conversation={conversation} results={history} />

      <div className="action-bar conversation-actions">
        <button className="btn btn-secondary btn-large" disabled={problems.length > 0 || !canSpeakOut || isStarting} onClick={onDemo}>
          <Icon name="volume" size={18} /> {t("conversationPlayDemo")}
        </button>
        <button className="btn btn-large" disabled={problems.length > 0 || !canRead || isStarting} onClick={onRead}>
          {isStarting ? <Spinner /> : <Icon name="mic" size={18} />} {t("conversationStartReading")}
        </button>
      </div>
      {!canSpeakOut && <p className="muted small">{t("conversationSpeechUnavailable")}</p>}
      {!canRead && <p className="muted small">{t("conversationRecognitionUnavailable")}</p>}
    </div>
  );
}
