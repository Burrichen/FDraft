"use client";

import { useCallback, useEffect, useState } from "react";

export interface AsyncDataState<T> {
  data: T | undefined;
  error: Error | null;
  isLoading: boolean;
  /** Re-runs the loader — call after a mutation to reflect it without a full page reload. */
  reload: () => void;
}

/**
 * The shared "load something from the local repositories on mount, and
 * again after a mutation" pattern every local-first page needs now that
 * there's no Server Component to fetch data before render (see
 * docs/product-spec.md, "FULL OFFLINE CORE FUNCTIONALITY", Prompt 9.5B —
 * IndexedDB is browser-only, so every data-owning page is a Client
 * Component). Deliberately tiny — no caching, no retries, no stale-time
 * tuning — because every read here is a local IndexedDB query, not a
 * network request; the sophistication a data-fetching library earns its
 * keep for doesn't apply.
 *
 * `loader` is called fresh every time this effect fires (deps change or
 * `reload()` is called) rather than through a ref — callers pass an inline
 * closure, and capturing whichever one was current at the render that
 * scheduled the effect is exactly the behavior wanted here.
 */
export function useAsyncData<T>(
  loader: () => Promise<T>,
  deps: unknown[],
): AsyncDataState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // Resetting to "loading" for this effect run is the whole point of this
    // hook — every dependency change or reload() means a new fetch is now
    // in flight, and the `cancelled` guard below still protects against an
    // in-flight fetch from a previous run resolving after a newer one.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true);
    setError(null);
    loader()
      .then((result) => {
        if (cancelled) return;
        setData(result);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause : new Error(String(cause)));
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  return { data, error, isLoading, reload };
}
