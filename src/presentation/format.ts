import { UiLanguage } from "@domain/entities/Language";

const LOCALES: Record<UiLanguage, string> = { fa: "fa-IR", en: "en-GB" };

export function formatDateTime(isoDate: string | null | undefined, language: UiLanguage): string {
  if (!isoDate) return "—";
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(LOCALES[language], { dateStyle: "medium", timeStyle: "short" });
}

export function formatDate(isoDate: string | null | undefined, language: UiLanguage): string {
  if (!isoDate) return "—";
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(LOCALES[language], { dateStyle: "medium" });
}

export function formatSeconds(milliseconds: number | null | undefined, language: UiLanguage): string {
  if (milliseconds === null || milliseconds === undefined) return "—";
  return (milliseconds / 1000).toLocaleString(LOCALES[language], { maximumFractionDigits: 1 });
}

export function formatNumber(value: number, language: UiLanguage, fractionDigits = 0): string {
  return value.toLocaleString(LOCALES[language], { maximumFractionDigits: fractionDigits });
}
