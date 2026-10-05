import { describe, expect, it } from "vitest";
import css from "./globals.css?raw";

/** Variáveis declaradas dentro do primeiro bloco que começa em `selector`. */
function varsIn(selector: string): string[] {
  const start = css.indexOf(selector);
  const block = css.slice(start, css.indexOf("}", start));
  return [...block.matchAll(/(--[\w-]+):/g)].map((m) => m[1] ?? "");
}

describe("tokens de tema", () => {
  const light = varsIn(":root {");

  it("o modo escuro redefine exatamente os mesmos tokens do claro", () => {
    expect(varsIn(':root:not([data-theme="light"])')).toEqual(light);
    expect(varsIn(':root[data-theme="dark"]')).toEqual(light);
  });

  it("todo token de cor vira utilitário do Tailwind via @theme", () => {
    const exposed = varsIn("@theme inline");
    for (const token of light) expect(exposed).toContain(`--color-${token.slice(2)}`);
  });
});
