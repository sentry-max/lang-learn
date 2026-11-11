import { useEffect, useRef } from "react";
import { Conversation, roleOf } from "@domain/entities/Conversation";
import { scoreOf } from "@domain/entities/SentencePractice";
import { PlannedLine } from "@domain/services/ConversationPlanner";
import { SentenceGrade } from "@domain/services/SentenceGrading";
import { useLanguage } from "@presentation/context/LanguageContext";
import ScorePill from "@presentation/components/sentence/ScorePill";
import { formatNumber } from "@presentation/format";

interface Props {
  conversation: Conversation;
  plan: PlannedLine[];
  activeIndex: number;
  /** Grades of the lines already read, by line id */
  gradeByLineId?: Record<string, SentenceGrade>;
}

/** Every planned line with its role and reader; the active line is marked and kept in view. */
export default function ConversationTranscript({ conversation, plan, activeIndex, gradeByLineId = {} }: Props) {
  const { t, language } = useLanguage();
  const activeLineRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    activeLineRef.current?.scrollIntoView?.({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
  }, [activeIndex]);

  return (
    <ol className="conversation-transcript">
      {plan.map((planned, index) => {
        const grade = gradeByLineId[planned.line.id];
        const state = index === activeIndex ? " active" : index < activeIndex ? " done" : "";
        return (
          <li
            key={planned.line.id}
            ref={index === activeIndex ? activeLineRef : undefined}
            className={`conversation-line${planned.speaker === "human" ? " human" : ""}${state}`}
            aria-current={index === activeIndex ? "step" : undefined}
          >
            <span className="conversation-line-role">
              <strong dir="auto">{roleOf(conversation, planned.roleId)?.name}</strong>
              <span className="muted small">
                {planned.readerNumber === null ? t("conversationBotName") : t("conversationReaderNumber", { number: formatNumber(planned.readerNumber, language) })}
              </span>
              {grade && <ScorePill score={scoreOf(grade)} />}
            </span>
            <span className="conversation-line-text" dir="auto">
              {planned.line.text}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
