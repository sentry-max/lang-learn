import { UiLanguage } from "@domain/entities/Language";

const LOCALES: Record<UiLanguage, string> = { fa: "fa-IR", en: "en-GB" };

export function formatDateTime(iso: string | null | undefined, language: UiLanguage): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(LOCALES[language], { dateStyle: "medium", timeStyle: "short" });
}

export function formatDate(iso: string | null | undefined, language: UiLanguage): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(LOCALES[language], { dateStyle: "medium" });
}

export function formatSeconds(ms: number | null | undefined, language: UiLanguage): string {
  if (ms === null || ms === undefined) return "—";
  return (ms / 1000).toLocaleString(LOCALES[language], { maximumFractionDigits: 1 });
}

export function formatNumber(value: number, language: UiLanguage, fractionDigits = 0): string {
  return value.toLocaleString(LOCALES[language], { maximumFractionDigits: fractionDigits });
}
