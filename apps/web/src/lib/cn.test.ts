import { describe, expect, it } from "vitest";
import { cn } from "./cn.ts";

describe("cn", () => {
  it("junta só as classes truthy", () => {
    expect(cn("a", false, null, undefined, "", "b")).toBe("a b");
  });
});
