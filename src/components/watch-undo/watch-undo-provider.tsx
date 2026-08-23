"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { WatchSessionUndoRecord } from "@/application/watchlist/local-watchlist-service";

interface WatchUndoContextValue {
  /** `undefined` if this watchlist entry has no pending session-undo. */
  getRecord: (watchlistEntryId: string) => WatchSessionUndoRecord | undefined;
  registerWatched: (record: WatchSessionUndoRecord) => void;
  clearUndo: (watchlistEntryId: string) => void;
  /**
   * The generalized lookup/clear pair behind `getRecord`/`clearUndo` (see
   * docs/updates, "PROMPT 19 — HALLOWEEN DRAFT MECHANICS") — a Halloween
   * Horror/Kitsch draft item has no watchlist entry (`entryId: null`), so
   * it's tracked by `draftItemId` instead. Pass whichever identifier
   * applies; exactly one of the two should be non-null for any real call
   * site. `getRecord(entryId)`/`clearUndo(entryId)` remain thin wrappers
   * over these for every existing, unmodified `WatchToggle` call site.
   */
  getRecordForItem: (
    entryId: string | null,
    draftItemId: string | null,
  ) => WatchSessionUndoRecord | undefined;
  clearUndoForItem: (
    entryId: string | null,
    draftItemId: string | null,
  ) => void;
  /**
   * Every watchlist entry id with a pending undo. A page that only queries
   * *currently active* watchlist entries (e.g. the main Watchlist page)
   * needs this to keep showing a film watched earlier this session after
   * the user navigates away and back — by then a fresh query would
   * correctly no longer find it active, but the undo opportunity must still
   * be there (see docs/product-spec.md, "WATCHED FILM UNDO", "UNDO
   * WINDOW").
   */
  listPendingEntryIds: () => string[];
  /**
   * The id of a draft this session's own actions archived (e.g. completing
   * its last remaining film) that still has a pending, not-yet-undone
   * record. The Active Draft page's normal query excludes archived drafts —
   * this is what lets it keep showing (and letting the user undo) a draft
   * that just became archived, even after navigating away and back. `null`
   * if nothing pending qualifies.
   */
  getPendingArchivedDraftId: () => string | null;
}

const WatchUndoContext = createContext<WatchUndoContextValue | null>(null);

/**
 * Session-only "can this still be undone" state for watched-film actions
 * (see docs/product-spec.md, "WATCHED FILM UNDO", "SESSION-ONLY STATE").
 * Deliberately plain in-memory React state, not written to the local
 * database anywhere — the watched action itself is already persisted by
 * `markLocalFilmWatched`; this map only tracks whether the UI should still
 * offer to reverse it. A hard reload naturally drops this state along with
 * the rest of the JS heap, which is the entire mechanism behind "the user
 * has until the application reloads" — no timer, no expiry field, nothing
 * to clean up.
 *
 * Must be mounted ABOVE the routed pages (see `AppShell`) so that
 * navigating between FDraft pages and back — which unmounts/remounts each
 * page's own component tree — does not lose it. Callers key this provider
 * by the active profile id so switching profiles starts a clean map instead
 * of leaking one profile's pending undos into another's session.
 */
export function WatchUndoProvider({ children }: { children: ReactNode }) {
  const [records, setRecords] = useState<
    ReadonlyMap<string, WatchSessionUndoRecord>
  >(() => new Map());

  const registerWatched = useCallback((record: WatchSessionUndoRecord) => {
    const key = record.watchlistEntryId ?? record.draftItemId;
    if (!key) return;
    setRecords((prev) => {
      const next = new Map(prev);
      next.set(key, record);
      return next;
    });
  }, []);

  const clearUndo = useCallback((watchlistEntryId: string) => {
    setRecords((prev) => {
      if (!prev.has(watchlistEntryId)) return prev;
      const next = new Map(prev);
      next.delete(watchlistEntryId);
      return next;
    });
  }, []);

  const getRecordForItem = useCallback(
    (entryId: string | null, draftItemId: string | null) => {
      const key = entryId ?? draftItemId;
      return key ? records.get(key) : undefined;
    },
    [records],
  );

  const clearUndoForItem = useCallback(
    (entryId: string | null, draftItemId: string | null) => {
      const key = entryId ?? draftItemId;
      if (!key) return;
      setRecords((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    },
    [],
  );

  const value = useMemo<WatchUndoContextValue>(
    () => ({
      getRecord: (watchlistEntryId) => records.get(watchlistEntryId),
      registerWatched,
      clearUndo,
      getRecordForItem,
      clearUndoForItem,
      // Specifically watchlist-entry-scoped (see the interface doc
      // comment on `WatchUndoContextValue`) — a Halloween off-watchlist
      // item's record is keyed by `draftItemId` instead and must never
      // be reported here, since consumers of this list (e.g. the
      // Watchlist page) only ever look up real watchlist entries.
      listPendingEntryIds: () =>
        Array.from(records.values())
          .map((record) => record.watchlistEntryId)
          .filter((id): id is string => id !== null),
      getPendingArchivedDraftId: () => {
        for (const record of records.values()) {
          if (record.draftArchivedByThisAction && record.draftId) {
            return record.draftId;
          }
        }
        return null;
      },
    }),
    [records, registerWatched, clearUndo, getRecordForItem, clearUndoForItem],
  );

  return (
    <WatchUndoContext.Provider value={value}>
      {children}
    </WatchUndoContext.Provider>
  );
}

export function useWatchUndo(): WatchUndoContextValue {
  const context = useContext(WatchUndoContext);
  if (!context) {
    throw new Error("useWatchUndo must be used within a WatchUndoProvider");
  }
  return context;
}
