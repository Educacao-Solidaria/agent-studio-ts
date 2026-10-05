import { describe, expect, it } from "vitest";
import { applyTheme } from "./theme.ts";

describe("applyTheme", () => {
  it("fixa o tema escolhido em data-theme", () => {
    const root = { dataset: {} as DOMStringMap };
    applyTheme("dark", root);
    expect(root.dataset.theme).toBe("dark");
    applyTheme("light", root);
    expect(root.dataset.theme).toBe("light");
  });

  it("remove data-theme quando volta para o sistema", () => {
    const root = { dataset: { theme: "dark" } as DOMStringMap };
    applyTheme("system", root);
    expect(root.dataset.theme).toBeUndefined();
  });
});
