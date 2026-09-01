import { describe, expect, it } from "vitest";
import {
  commitHistory,
  createHistory,
  redoHistory,
  undoHistory,
} from "./placement-history";

describe("placement-history", () => {
  it("commit records the previous present into past and clears future", () => {
    let history = createHistory("a");
    history = commitHistory(history, "b");
    expect(history).toEqual({ past: ["a"], present: "b", future: [] });
  });

  it("commit is a no-op when the value is reference-identical to present", () => {
    const value = { x: 1 };
    const history = createHistory(value);
    const after = commitHistory(history, value);
    expect(after).toBe(history);
  });

  it("undo moves present back into future and pops the last past entry", () => {
    let history = createHistory("a");
    history = commitHistory(history, "b");
    history = commitHistory(history, "c");
    history = undoHistory(history);
    expect(history).toEqual({ past: ["a"], present: "b", future: ["c"] });
  });

  it("undo with an empty past is a no-op", () => {
    const history = createHistory("a");
    expect(undoHistory(history)).toBe(history);
  });

  it("redo moves the first future entry back into present", () => {
    let history = createHistory("a");
    history = commitHistory(history, "b");
    history = undoHistory(history);
    history = redoHistory(history);
    expect(history).toEqual({ past: ["a"], present: "b", future: [] });
  });

  it("redo with an empty future is a no-op", () => {
    const history = createHistory("a");
    expect(redoHistory(history)).toBe(history);
  });

  it("a new commit after undo discards the abandoned future (standard redo-invalidation)", () => {
    let history = createHistory("a");
    history = commitHistory(history, "b");
    history = commitHistory(history, "c");
    history = undoHistory(history); // present "b", future ["c"]
    history = commitHistory(history, "d");
    expect(history).toEqual({ past: ["a", "b"], present: "d", future: [] });
  });

  it("caps history depth so a long editing session doesn't grow past unbounded", () => {
    let history = createHistory(0);
    for (let i = 1; i <= 150; i += 1) {
      history = commitHistory(history, i);
    }
    expect(history.past.length).toBeLessThanOrEqual(100);
    expect(history.present).toBe(150);
  });
});
