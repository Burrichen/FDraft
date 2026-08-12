"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface AsyncDataState<T> {
  data: T | undefined;
  error: Error | null;
  isLoading: boolean;
  /** Re-runs the loader — call after a mutation to reflect it without a full page reload. Flips `isLoading` true first, so a page gating its render on that briefly shows nothing while this runs. */
  reload: () => void;
  /**
   * Re-runs the loader WITHOUT flipping `isLoading` — the previously loaded
   * `data` stays rendered until the fresh result replaces it, so a page
   * gating its render on `isLoading` never blanks for this. Meant for
   * lightweight, frequent local mutations (e.g. marking a film watched, or
   * undoing that — see docs/product-spec.md, "WATCHED FILM UNDO") where a
   * `reload()`-style loading flash would be a jarring flicker on every
   * click; `reload()` is still right for a rarer, deliberate "start over"
   * action.
   */
  reloadSilently: () => Promise<void>;
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

  // Read by `reloadSilently`, which runs outside this effect (from an event
  // handler, not a dependency change) and so needs whichever `loader`
  // closure is current at call time, not whichever one this effect closed
  // over when it last ran. Updated in its own effect (not during render —
  // refs are for event handlers/effects, not render) but that's still
  // always ahead of any `reloadSilently()` call, which can only happen from
  // a later event handler once this effect has already committed.
  const loaderRef = useRef(loader);
  useEffect(() => {
    loaderRef.current = loader;
  });

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

  const reloadSilently = useCallback(async () => {
    try {
      const result = await loaderRef.current();
      setData(result);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error(String(cause)));
    }
  }, []);

  return { data, error, isLoading, reload, reloadSilently };
}
