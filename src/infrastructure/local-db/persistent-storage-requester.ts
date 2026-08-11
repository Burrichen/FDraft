/**
 * Asks the browser to promote FDraft's IndexedDB storage to "persistent"
 * (see docs/product-spec.md, "BROWSER STORAGE PERSISTENCE" — Prompt 9.5D),
 * so it's exempt from the browser's own storage-pressure eviction — the
 * one thing a portable backup file can't protect against, since it only
 * helps once the user has actually taken one. Persistence is never the
 * *canonical* safety mechanism here — exporting a backup (Phase 9.5C)
 * always is — this is a best-effort improvement on top of it.
 *
 * Asked at most once, ever, per browser (see the `localStorage` flag
 * below) — this is the second deliberate use of `localStorage` in the app,
 * alongside `ActiveProfilePointer`; both are small device-local flags, not
 * user data (see docs/product-spec.md, "LOCAL DATABASE"). Callers decide
 * *when* it's respectful to ask (see `AppShell`, which only calls this
 * once a real profile is active — never on the bare first-run screen);
 * this class only enforces that it's never asked more than once.
 */
export interface PersistentStorageRequester {
  requestOnce(): Promise<void>;
}

const ASKED_STORAGE_KEY = "fdraft:storage-persist-requested";

export class BrowserPersistentStorageRequester implements PersistentStorageRequester {
  async requestOnce(): Promise<void> {
    if (window.localStorage.getItem(ASKED_STORAGE_KEY)) {
      return;
    }
    window.localStorage.setItem(ASKED_STORAGE_KEY, "1");

    try {
      if (!navigator.storage?.persist) {
        return; // Storage Manager API not supported by this browser — nothing to do.
      }
      const alreadyPersisted = await navigator.storage.persisted?.();
      if (alreadyPersisted) {
        return;
      }
      await navigator.storage.persist();
    } catch {
      // Denial isn't an error under the spec (persist() resolves to
      // `false`), but some non-standard embeddings (e.g. a restrictive
      // iframe) can throw instead — never let that surface to the user.
    }
  }
}

/** A no-op stand-in for tests — never touches `localStorage`/`navigator.storage`. */
export class InMemoryPersistentStorageRequester implements PersistentStorageRequester {
  async requestOnce(): Promise<void> {}
}
