import { describe, expect, it } from "vitest";
import { cn } from "./cn.ts";

describe("cn", () => {
  it("ignora valores falsy e aceita objetos e arrays (clsx)", () => {
    expect(cn("a", false, null, undefined, "", ["b", { c: true, d: false }])).toBe("a b c");
  });

  it("a última utilidade conflitante vence", () => {
    expect(cn("px-2 py-1", "p-4")).toBe("p-4");
    expect(cn("bg-primary", "bg-danger")).toBe("bg-danger");
    expect(cn("text-sm text-muted-foreground", "text-danger")).toBe("text-sm text-danger");
  });

  it("conhece os tokens próprios de espaçamento e animação", () => {
    expect(cn("p-2", "p-panel")).toBe("p-panel");
    expect(cn("animate-pop-in", "animate-fade-in")).toBe("animate-fade-in");
  });
});
