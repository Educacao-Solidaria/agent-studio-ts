import { describe, expect, it } from "vitest";
import { datedFileName } from "./download.ts";

describe("datedFileName", () => {
  it("nome previsível na data local, sem nada do usuário", () => {
    expect(datedFileName("fluxo", "svg", new Date(2026, 0, 5, 23, 59))).toBe(
      "fluxo-2026-01-05.svg",
    );
    expect(datedFileName("conversa", "md", new Date(2026, 11, 31))).toBe("conversa-2026-12-31.md");
  });
});
