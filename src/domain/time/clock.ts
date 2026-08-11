/**
 * Abstraction over "what time is it right now" (see docs/product-spec.md,
 * "TIME HANDLING" — Prompt 9.5A). FDraft is local-first: there is no server
 * clock to defer to, so the device clock is necessarily the only time
 * source available. That makes it more important, not less, that every call
 * site asks a `Clock` instead of calling `new Date()`/`Date.now()` directly
 * — it's the only way tests can inject a deterministic instant, and the
 * only seam that would let a future sync layer substitute a
 * server-corrected clock without touching every call site.
 *
 * A `Clock` only ever answers "what time is it now" — it must never be used
 * to *recalculate* a deadline that was already computed and persisted (see
 * `src/domain/drafts/deadline.ts`). Persisted `deadline_at`/`started_at`
 * values are fixed at creation time; changing the device clock afterward
 * must never move them.
 */
export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

/** A deterministic clock for tests — never advances on its own. */
export class FixedClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current.getTime());
  }

  /** Moves the fixed instant forward (or backward) — useful for simulating "a day later" without depending on wall-clock time. */
  advance(deltaMs: number): void {
    this.current = new Date(this.current.getTime() + deltaMs);
  }

  set(next: Date): void {
    this.current = new Date(next.getTime());
  }
}
