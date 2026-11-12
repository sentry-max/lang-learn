import { ConversationProblem } from "@domain/entities/Conversation";
import { ConversationImportResult } from "@application/services/ConversationService";
import { UiStringKey, translate } from "@presentation/i18n/translations";

type Translate = (key: UiStringKey, values?: Parameters<typeof translate>[2]) => string;

const PROBLEM_KEYS: Record<ConversationProblem, UiStringKey> = {
  not_an_object: "conversationProblemNotAnObject",
  file_too_many: "conversationProblemFileTooMany",
  id_missing: "conversationProblemIdMissing",
  version_invalid: "conversationProblemVersionInvalid",
  language_invalid: "conversationProblemLanguageInvalid",
  level_invalid: "conversationProblemLevelInvalid",
  title_missing: "conversationProblemTitleMissing",
  role_count: "conversationProblemRoleCount",
  role_invalid: "conversationProblemRoleInvalid",
  role_duplicate: "conversationProblemRoleDuplicate",
  required_roles_too_few: "conversationProblemRequiredRoles",
  round_count: "conversationProblemRoundCount",
  round_priorities: "conversationProblemRoundPriorities",
  line_invalid: "conversationProblemLineInvalid",
  line_duplicate: "conversationProblemLineDuplicate",
  line_role_unknown: "conversationProblemLineRoleUnknown",
  round_roles_mismatch: "conversationProblemRoundRoles",
};

/** Every problem of one dialogue in an imported file, with the dialogue it belongs to. */
export function describeConversationProblems(t: Translate, problem: ConversationImportResult["problems"][number]): string[] {
  const label = problem.entryNumber === null ? null : t("conversationProblemEntry", { number: problem.entryNumber, title: problem.title ?? "—" });
  return problem.codes.map((code) => (label ? `${label}: ${t(PROBLEM_KEYS[code])}` : t(PROBLEM_KEYS[code])));
}
