import { useEffect, useState } from "react";
import { Conversation, roleOf } from "@domain/entities/Conversation";
import { PlannedLine } from "@domain/services/ConversationPlanner";
import { speakLine, stopSpeaking } from "@presentation/speech";

export type DemoStatus = "playing" | "paused" | "finished";

/** Speaks every planned line in turn with its role's voice. Pausing stops the current line; resuming repeats it. */
export function useConversationDemo(conversation: Conversation, plan: PlannedLine[]) {
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<DemoStatus>("playing");

  useEffect(() => {
    const planned = plan[index];
    if (status !== "playing" || !planned) return;
    let cancelled = false;
    void speakLine(planned.line.text, conversation.language, roleOf(conversation, planned.roleId)?.gender ?? "female").then(() => {
      if (cancelled) return;
      if (index + 1 < plan.length) setIndex(index + 1);
      else setStatus("finished");
    });
    return () => {
      cancelled = true;
      stopSpeaking();
    };
  }, [conversation, plan, index, status]);

  return {
    index,
    status,
    pause: () => setStatus("paused"),
    resume: () => setStatus("playing"),
    restart: () => {
      setIndex(0);
      setStatus("playing");
    },
  };
}
