import { TransformTask } from "@domain/entities/SentenceExercise";
import { InsightTopic } from "@domain/services/SentenceInsights";
import { UiStringKey, translate } from "@presentation/i18n/translations";
import { SENTENCE_KIND_KEYS } from "@presentation/i18n/grammarLabels";

type Translate = (key: UiStringKey, values?: Parameters<typeof translate>[2]) => string;

const TASK_TOPIC_KEYS: Record<TransformTask, UiStringKey> = {
  present: "transformTopicPresent",
  simple_past: "transformTopicSimplePast",
  present_perfect: "transformTopicPresentPerfect",
  past_perfect: "transformTopicPastPerfect",
  future: "transformTopicFuture",
  future_perfect: "transformTopicFuturePerfect",
  negative: "transformTopicNegative",
  question: "transformTopicQuestion",
  passive: "transformTopicPassive",
  active: "transformTopicActive",
};

/** A topic's name: an author's tag as written, a transformation task or an exercise kind in the UI language. */
export function describeInsightTopic(t: Translate, topic: InsightTopic): string {
  if (topic.kind === "tag") return topic.tag;
  if (topic.kind === "task") return t(TASK_TOPIC_KEYS[topic.task]);
  return t(SENTENCE_KIND_KEYS[topic.exerciseKind].label);
}
