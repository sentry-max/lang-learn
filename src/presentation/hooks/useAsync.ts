import { DependencyList, useCallback, useEffect, useRef, useState } from "react";

export interface AsyncState<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload: () => Promise<void>;
  setData: (update: T | ((previous: T | undefined) => T)) => void;
}

/**
 * Runs `load` whenever `deps` change and tracks its result. Results of
 * superseded or unmounted runs are ignored, so fast navigation or rapid
 * filter changes never show stale data.
 */
export function useAsync<T>(load: () => Promise<T>, deps: DependencyList): AsyncState<T> {
  const [data, setDataState] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const runId = useRef(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(async () => {
    const id = ++runId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await load();
      if (id === runId.current) setDataState(result);
    } catch (err) {
      if (id === runId.current) setError(err);
    } finally {
      if (id === runId.current) setLoading(false);
    }
  }, deps);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(
    () => () => {
      runId.current += 1;
    },
    []
  );

  const setData = useCallback((update: T | ((previous: T | undefined) => T)) => {
    setDataState((previous) =>
      typeof update === "function" ? (update as (p: T | undefined) => T)(previous) : update
    );
  }, []);

  return { data, error, loading, reload, setData };
}
