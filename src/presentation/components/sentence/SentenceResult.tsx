import { scoreOf } from "@domain/entities/SentencePractice";
import { MarkStatus, SentenceGrade, countMarks } from "@domain/services/SentenceGrading";
import { useLanguage } from "@presentation/context/LanguageContext";
import GradedSentence from "@presentation/components/sentence/GradedSentence";
import ScoreRing from "@presentation/components/ui/ScoreRing";
import Icon from "@presentation/components/ui/Icon";
import { UiStringKey } from "@presentation/i18n/translations";
import { formatNumber } from "@presentation/format";

const MARK_CHIPS: { status: MarkStatus; key: UiStringKey; symbol: string }[] = [
  { status: "correct", key: "sentenceMarkCorrect", symbol: "✓" },
  { status: "wrong", key: "sentenceMarkWrong", symbol: "✗" },
  { status: "missing", key: "sentenceMarkMissing", symbol: "+" },
  { status: "extra", key: "sentenceMarkExtra", symbol: "−" },
  { status: "typo", key: "sentenceMarkTypo", symbol: "~" },
];

/** The graded answer: score ring and verdict, a chip per kind of mark, the answer word by word, and the correct sentence. */
export default function SentenceResult({ grade, timedOut }: { grade: SentenceGrade; timedOut: boolean }) {
  const { t, language } = useLanguage();
  const score = scoreOf(grade);
  const counts = countMarks(grade.marks);
  const verdict: UiStringKey =
    grade.errorCount === 0 ? "sentencePerfect" : score >= 0.75 ? "sentenceVerdictGood" : score >= 0.5 ? "sentenceVerdictFair" : "sentenceVerdictPoor";

  return (
    <div className="sentence-result feedback">
      <div className="result-header">
        <ScoreRing score={score} size={72} label={t("sentenceScoreLabel")} />
        <div>
          <strong className="result-verdict">{t(verdict)}</strong>
          <p className="muted small">
            {t("sentenceErrorCount", { errors: formatNumber(grade.errorCount, language), max: formatNumber(grade.maxErrors, language) })}
          </p>
          {timedOut && (
            <p className="result-timeout small">
              <Icon name="hourglass" size={14} /> {t("sentenceTimedOut")}
            </p>
          )}
        </div>
      </div>

      <div className="mark-chips">
        {MARK_CHIPS.filter((chip) => counts[chip.status] > 0).map((chip) => (
          <span key={chip.status} className={`mark-chip mark-${chip.status}`}>
            <span aria-hidden="true">{chip.symbol}</span> {t(chip.key, { count: formatNumber(counts[chip.status], language) })}
          </span>
        ))}
      </div>

      <GradedSentence grade={grade} />

      {(grade.errorCount > 0 || counts.typo > 0) && (
        <div className="correct-box">
          <Icon name="check" size={18} />
          <div>
            <span className="field-label">{t("sentenceCorrectAnswer")}</span>
            <p className="correct-sentence" dir="auto">
              {grade.correctSentence}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
