import { SentenceGrade, TokenMark } from "@domain/services/SentenceGrading";
import { useLanguage } from "@presentation/context/LanguageContext";

/**
 * The answer word by word: right words green, wrong ones red with the right word over them, missing ones dashed,
 * extra ones struck out, and misspelt ones amber with the right spelling over them.
 */
export default function GradedSentence({ grade }: { grade: SentenceGrade }) {
  const { t } = useLanguage();
  return (
    <p className="graded-sentence" dir="auto">
      {grade.marks.map((mark, index) => (
        <MarkView key={index} mark={mark} label={markLabel(mark, t)} />
      ))}
    </p>
  );
}

function MarkView({ mark, label }: { mark: TokenMark; label: string | undefined }) {
  if (mark.status === "given") return <span className="mark-given">{mark.actual}</span>;
  return (
    <span className={`mark mark-${mark.status}`} aria-label={label}>
      {(mark.status === "wrong" || mark.status === "typo") && <span className="mark-expected">{mark.expected}</span>}
      <span className="mark-word">{mark.status === "missing" ? mark.expected : mark.actual}</span>
    </span>
  );
}

function markLabel(mark: TokenMark, t: ReturnType<typeof useLanguage>["t"]): string | undefined {
  if (mark.status === "wrong") return t("sentenceWrongWord", { actual: mark.actual ?? "", expected: mark.expected ?? "" });
  if (mark.status === "missing") return t("sentenceMissingWord", { word: mark.expected ?? "" });
  if (mark.status === "extra") return t("sentenceExtraWord", { word: mark.actual ?? "" });
  if (mark.status === "typo") return t("sentenceTypoWord", { actual: mark.actual ?? "", expected: mark.expected ?? "" });
  return undefined;
}
