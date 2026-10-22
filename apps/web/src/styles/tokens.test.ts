import { describe, expect, it } from "vitest";
import css from "./globals.css?raw";

/** Variáveis declaradas dentro do primeiro bloco que começa em `selector`. */
function varsIn(selector: string): string[] {
  const start = css.indexOf(selector);
  const block = css.slice(start, css.indexOf("}", start));
  return [...block.matchAll(/(--[\w-]+):/g)].map((m) => m[1] ?? "");
}

/** `oklch(L C h)` de cada token do primeiro bloco que começa em `selector`. */
function colorsIn(selector: string) {
  const start = css.indexOf(selector);
  const block = css.slice(start, css.indexOf("}", start));
  const found = [...block.matchAll(/(--[\w-]+):\s*oklch\(([^)]*)\)/g)];
  return new Map(found.map((m) => [m[1] ?? "", (m[2] ?? "").trim().split(/\s+/).map(Number)]));
}

/** Luminância relativa (WCAG) de um oklch: OKLab → sRGB linear, recortado ao gamut. */
function luminance([l = 0, c = 0, h = 0]: number[]) {
  const [a, b] = [c * Math.cos((h * Math.PI) / 180), c * Math.sin((h * Math.PI) / 180)];
  const L = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const M = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const S = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ].map((v) => Math.min(1, Math.max(0, v)));
  return 0.2126 * (rgb[0] ?? 0) + 0.7152 * (rgb[1] ?? 0) + 0.0722 * (rgb[2] ?? 0);
}

const contrast = (x: number[], y: number[]) => {
  const [hi = 0, lo = 0] = [luminance(x), luminance(y)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
};

describe("tokens de tema", () => {
  const light = varsIn(":root {");

  // O axe no Chromium (e2e/a11y.spec.ts) só mede o que alguma story mostra; aqui vão todos os
  // pares, até os de estado raro (a faixa verde de "Conexão restabelecida").
  it("todo texto sobre o fundo do seu par tem 4,5:1 (AA) nos dois temas", () => {
    expect(contrast([1, 0, 0], [0, 0, 0])).toBeCloseTo(21); // branco × preto: a conversão confere
    for (const theme of [
      ":root {",
      ':root:not([data-theme="light"])',
      ':root[data-theme="dark"]',
    ]) {
      const colors = colorsIn(theme);
      const texts = [...colors.keys()].filter((token) => token.endsWith("foreground"));
      expect(texts.length).toBeGreaterThanOrEqual(8);
      for (const text of texts) {
        const surface = text === "--foreground" ? "--background" : text.replace("-foreground", "");
        const missing = [Number.NaN]; // token sem par vira NaN e reprova
        const ratio = contrast(colors.get(text) ?? missing, colors.get(surface) ?? missing);
        expect(ratio, `${theme} ${text} sobre ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("o modo escuro redefine exatamente os mesmos tokens do claro", () => {
    expect(light).toContain("--background"); // CSS vazio faria os dois testes passarem sem comparar
    expect(varsIn(':root:not([data-theme="light"])')).toEqual(light);
    expect(varsIn(':root[data-theme="dark"]')).toEqual(light);
  });

  it("todo token de cor vira utilitário do Tailwind via @theme", () => {
    const exposed = varsIn("@theme inline {");
    for (const token of light) expect(exposed).toContain(`--color-${token.slice(2)}`);
  });
});
