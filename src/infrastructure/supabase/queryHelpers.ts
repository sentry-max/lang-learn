import { throwIfSupabaseError } from "@infrastructure/supabase/supabaseErrors";

/** PostgREST caps responses at the project's "Max Rows" (1000 by default). */
export const PAGE_SIZE = 1000;

/** Keeps `.in()` filters well under URL length limits. */
export const ID_CHUNK_SIZE = 150;

/** Rows per bulk upsert request. */
export const WRITE_CHUNK_SIZE = 500;

type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>;

/**
 * Reads every row of a query by paging with `.range()`. The query must have
 * a stable `order()` or pages can overlap/skip rows.
 */
export async function fetchAllPages<T>(page: (from: number, to: number) => PageResult<T>, errorMessage: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    throwIfSupabaseError(error, errorMessage);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export function unique<T>(items: readonly T[]): T[] {
  return Array.from(new Set(items));
}

/** Removes LIKE wildcards and PostgREST filter syntax so user search text is matched literally. */
export function sanitizeSearchText(text: string): string {
  return text.replace(/[\\%_*(),."':]/g, " ").replace(/\s+/g, " ").trim();
}

export function nowIso(): string {
  return new Date().toISOString();
}
