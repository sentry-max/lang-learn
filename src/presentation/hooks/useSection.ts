import { useSearchParams } from "react-router-dom";

/** The parts of the app a page can switch between: words (vocabularies), sentences and conversations. */
export type Section = "words" | "sentences" | "conversations";

const SECTIONS: Section[] = ["words", "sentences", "conversations"];

/** The section a page shows, kept in the URL (`?section=sentences`) so links and the back button land on it. */
export function useSection(): [Section, (section: Section) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const section = SECTIONS.find((candidate) => candidate === searchParams.get("section")) ?? "words";
  const setSection = (next: Section) => setSearchParams(next === "words" ? {} : { section: next }, { replace: true });
  return [section, setSection];
}
