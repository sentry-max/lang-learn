import { useSearchParams } from "react-router-dom";

/** The two halves of the app: words (vocabularies) and sentences. */
export type Section = "words" | "sentences";

/** The section a page shows, kept in the URL (`?section=sentences`) so links and the back button land on it. */
export function useSection(): [Section, (section: Section) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const section: Section = searchParams.get("section") === "sentences" ? "sentences" : "words";
  const setSection = (next: Section) => setSearchParams(next === "words" ? {} : { section: next }, { replace: true });
  return [section, setSection];
}
