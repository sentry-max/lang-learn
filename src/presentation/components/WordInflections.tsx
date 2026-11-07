import { useMemo } from "react";
import { CaseForms, GrammaticalCase, PronounCases, WordInflection } from "@domain/entities/Inflection";
import { LanguageCode } from "@domain/entities/Language";
import { Word } from "@domain/entities/Word";
import { inflectWord } from "@domain/services/WordInflectionService";
import { useLanguage } from "@presentation/context/LanguageContext";
import { CASE_KEYS, PRINCIPAL_PART_KEYS, TENSE_KEYS } from "@presentation/i18n/grammarLabels";

type NounInflection = Extract<WordInflection, { kind: "noun" }>;
type VerbInflection = Extract<WordInflection, { kind: "verb" }>;

function CaseList({ title, cases }: { title: string; cases: CaseForms[] }) {
  const { t } = useLanguage();
  return (
    <>
      <p className="inflection-title">{title}</p>
      <dl className="inflection-cases">
        {cases.map((forms) => (
          <div key={forms.grammaticalCase}>
            <dt>{t(CASE_KEYS[forms.grammaticalCase])}</dt>
            <dd dir="ltr">
              <span>{forms.definite}</span>
              {forms.indefinite && <span>{forms.indefinite}</span>}
              <span>{forms.negative}</span>
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}

function NounForms({ inflection }: { inflection: NounInflection }) {
  const { t } = useLanguage();
  return (
    <>
      {inflection.plural && (
        <dl className="inflection-parts">
          <dt>{t("pluralLabel")}</dt>
          <dd dir="auto">{inflection.plural}</dd>
        </dl>
      )}
      {inflection.singularCases.length > 0 && <CaseList title={t("singularLabel")} cases={inflection.singularCases} />}
      {inflection.pluralCases.length > 0 && <CaseList title={t("pluralLabel")} cases={inflection.pluralCases} />}
    </>
  );
}

const PRONOUN_CASES: GrammaticalCase[] = ["nominative", "accusative", "dative"];

function PronounTable({ pronouns }: { pronouns: PronounCases[] }) {
  const { t } = useLanguage();
  return (
    <details className="inflection-tense">
      <summary>{t("pronounsLabel")}</summary>
      <table className="inflection-table">
        <thead>
          <tr>
            {PRONOUN_CASES.map((grammaticalCase) => (
              <th key={grammaticalCase} scope="col">
                {t(CASE_KEYS[grammaticalCase])}
              </th>
            ))}
          </tr>
        </thead>
        <tbody dir="ltr">
          {pronouns.map((pronoun, index) => (
            <tr key={index}>
              {PRONOUN_CASES.map((grammaticalCase) => (
                <td key={grammaticalCase}>{pronoun[grammaticalCase]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function VerbForms({ inflection }: { inflection: VerbInflection }) {
  const { t } = useLanguage();
  return (
    <>
      {inflection.principalParts.length > 0 && (
        <dl className="inflection-parts">
          {inflection.principalParts.map((part) => (
            <div key={part.name} style={{ display: "contents" }}>
              <dt>{t(PRINCIPAL_PART_KEYS[part.name])}</dt>
              <dd dir="ltr">{part.form}</dd>
            </div>
          ))}
        </dl>
      )}
      {inflection.pronouns.length > 0 && <PronounTable pronouns={inflection.pronouns} />}
      {inflection.tables.length > 0 && <p className="inflection-title">{t("allTensesLabel")}</p>}
      {inflection.tables.map((table, tableIndex) => (
        <details key={table.tense} className="inflection-tense" open={tableIndex === 0}>
          <summary>{t(TENSE_KEYS[table.tense])}</summary>
          <table className="inflection-table" dir="ltr">
            <tbody>
              {table.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  <th scope="row">{row.person}</th>
                  <td>{row.form}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ))}
    </>
  );
}

/** Every form of a noun or verb: cases with their articles and the plural, or all tenses. */
export default function WordInflections({ word, sourceLanguage }: { word: Word; sourceLanguage: LanguageCode }) {
  const inflection = useMemo(() => inflectWord(word, sourceLanguage), [word, sourceLanguage]);
  if (!inflection) return null;
  return (
    <div className="inflection">
      {inflection.kind === "noun" ? <NounForms inflection={inflection} /> : <VerbForms inflection={inflection} />}
    </div>
  );
}
