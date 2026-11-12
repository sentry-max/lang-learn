import { Conversation, conversationTitle } from "@domain/entities/Conversation";
import { PlannedLine } from "@domain/services/ConversationPlanner";
import { useLanguage } from "@presentation/context/LanguageContext";
import { useConversationDemo } from "@presentation/hooks/useConversationDemo";
import ConversationTranscript from "@presentation/components/conversation/ConversationTranscript";
import Icon from "@presentation/components/ui/Icon";
import { ProgressIndicator } from "@presentation/components/ui/Loader";

interface Props {
  conversation: Conversation;
  plan: PlannedLine[];
  onEnd: () => void;
}

/** The whole dialogue spoken by the app's voices, a female and a male one; it can be paused and played again. */
export default function ConversationDemo({ conversation, plan, onEnd }: Props) {
  const { t } = useLanguage();
  const demo = useConversationDemo(conversation, plan);
  const progress = demo.status === "finished" ? 1 : demo.index / Math.max(1, plan.length);

  return (
    <div className="app-main quiz-main">
      <div className="quiz-header">
        <button type="button" className="icon-btn" onClick={onEnd} aria-label={t("conversationEndDemo")} title={t("conversationEndDemo")}>
          <Icon name="close" />
        </button>
        <h1 className="conversation-topic" dir="auto">
          {conversationTitle(conversation)}
        </h1>
        <ProgressIndicator value={progress} />
        <span className="quiz-counter">{t("conversationDemoTitle")}</span>
      </div>

      <ConversationTranscript conversation={conversation} plan={plan} activeIndex={demo.status === "finished" ? plan.length : demo.index} />

      <div className="quiz-dock conversation-dock">
        {demo.status === "finished" ? (
          <button className="btn btn-block btn-large" onClick={demo.restart} autoFocus>
            <Icon name="refresh" size={18} /> {t("conversationPlayAgain")}
          </button>
        ) : demo.status === "paused" ? (
          <button className="btn btn-block btn-large" onClick={demo.resume}>
            <Icon name="volume" size={18} /> {t("conversationResume")}
          </button>
        ) : (
          <button className="btn btn-secondary btn-block btn-large" onClick={demo.pause}>
            <Icon name="volumeOff" size={18} /> {t("conversationPause")}
          </button>
        )}
        <button className="btn btn-ghost btn-block btn-large" onClick={onEnd}>
          {t("conversationEndDemo")}
        </button>
      </div>
    </div>
  );
}
