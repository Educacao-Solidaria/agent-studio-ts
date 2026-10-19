import { describe, expect, it } from "vitest";
import { createHistory, HISTORY_LIMIT, record, redo, undo } from "./history.ts";

describe("history", () => {
  it("anda para trás e para frente, e uma ação nova apaga o refazer", () => {
    let history = record(record(createHistory("a"), "b"), "c");
    history = undo(undo(history));
    expect(history).toEqual({ past: [], present: "a", future: ["b", "c"] });
    history = redo(history);
    expect(history).toEqual({ past: ["a"], present: "b", future: ["c"] });
    expect(record(history, "d")).toEqual({ past: ["a", "b"], present: "d", future: [] });
  });

  it("sem passado ou sem futuro devolve o mesmo objeto", () => {
    const history = createHistory(1);
    expect(undo(history)).toBe(history);
    expect(redo(history)).toBe(history);
  });

  it("guarda no máximo o teto e descarta a entrada mais antiga", () => {
    let history = createHistory(0);
    for (let n = 1; n <= HISTORY_LIMIT + 5; n++) history = record(history, n);
    expect(history.past).toHaveLength(HISTORY_LIMIT);
    expect(history.past[0]).toBe(5);
    expect(record(record(record(createHistory(0), 1, 2), 2, 2), 3, 2).past).toEqual([1, 2]);
  });

  it("teto 0, negativo ou NaN desliga o histórico", () => {
    for (const limit of [0, -1, Number.NaN]) {
      const history = record(createHistory("a"), "b", limit);
      expect(history, String(limit)).toEqual({ past: [], present: "b", future: [] });
      expect(undo(history)).toBe(history);
    }
  });

  it("nunca altera o histórico recebido", () => {
    const frozen = Object.freeze({
      past: Object.freeze(["a"]),
      present: "b",
      future: Object.freeze(["c"]),
    });
    // Congelado: qualquer push/splice nele lançaria TypeError (módulo ES é strict).
    expect(record(frozen, "x").past).toEqual(["a", "b"]);
    expect(undo(frozen).present).toBe("a");
    expect(redo(frozen).present).toBe("c");
    expect(frozen).toEqual({ past: ["a"], present: "b", future: ["c"] });
  });
});
