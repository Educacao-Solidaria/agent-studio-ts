import { describe, expect, it } from "vitest";
import { EMPTY, formatCurrency, formatDuration, formatNumber, formatTokens } from "./format.ts";

// Intl separa número e unidade/moeda com espaço não separável; normaliza para comparar.
const plain = (text: string) => text.replace(/\s/g, " ");

describe("formatNumber", () => {
  it("usa pt-BR por padrão e aceita outro locale", () => {
    expect(formatNumber(1234567.891)).toBe("1.234.567,891");
    expect(formatNumber(1234567.891, {}, "en-US")).toBe("1,234,567.891");
    expect(formatNumber(0.256, { style: "percent" })).toBe(plain("26%"));
  });

  it("não mostra NaN nem Infinity", () => {
    expect(formatNumber(Number.NaN)).toBe(EMPTY);
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe(EMPTY);
  });
});

describe("formatCurrency", () => {
  it("formata dólar (OpenRouter) por padrão com duas casas", () => {
    expect(plain(formatCurrency(1.5))).toBe("US$ 1,50");
    expect(plain(formatCurrency(1234.567))).toBe("US$ 1.234,57");
    expect(plain(formatCurrency(0))).toBe("US$ 0,00");
  });

  it("aceita moeda e locale", () => {
    expect(plain(formatCurrency(1234.5, "BRL"))).toBe("R$ 1.234,50");
    expect(formatCurrency(1234.5, "USD", "en-US")).toBe("$1,234.50");
    expect(plain(formatCurrency(1234.5, "JPY"))).toBe("JP¥ 1.235");
  });

  it("mantém visível o custo abaixo de um centavo", () => {
    expect(plain(formatCurrency(0.000123))).toBe("US$ 0,00012");
    expect(formatCurrency(-0.004, "USD", "en-US")).toBe("-$0.004");
  });
});

describe("formatTokens", () => {
  it("compacta em k, M e B com uma casa", () => {
    expect(formatTokens(950)).toBe("950");
    expect(formatTokens(1000)).toBe("1k");
    expect(formatTokens(1234)).toBe("1,2k");
    expect(formatTokens(3_400_000)).toBe("3,4M");
    expect(formatTokens(7_250_000_000)).toBe("7,3B");
    expect(formatTokens(1234, "en-US")).toBe("1.2k");
    expect(formatTokens(-1500)).toBe("-1,5k");
  });

  it("promove a unidade quando o arredondamento chega a 1000", () => {
    expect(formatTokens(999_950)).toBe("1M");
    expect(formatTokens(999_940)).toBe("999,9k");
  });

  it("não mostra NaN", () => {
    expect(formatTokens(Number.NaN)).toBe(EMPTY);
  });
});

describe("formatDuration", () => {
  it("usa ms abaixo de um segundo e segundos com uma casa abaixo de um minuto", () => {
    expect(plain(formatDuration(0))).toBe("0 ms");
    expect(plain(formatDuration(850.4))).toBe("850 ms");
    expect(plain(formatDuration(1500))).toBe("1,5 s");
    expect(plain(formatDuration(59_900))).toBe("59,9 s");
  });

  it("não mostra 1000 ms nem 60 s quando o arredondamento passa da unidade", () => {
    expect(plain(formatDuration(999.6))).toBe("1 s");
    expect(plain(formatDuration(59_960))).toBe("1 min");
  });

  it("decompõe em h, min e s omitindo as partes zeradas", () => {
    expect(plain(formatDuration(65_000))).toBe("1 min 5 s");
    expect(plain(formatDuration(120_000))).toBe("2 min");
    expect(plain(formatDuration(3_660_000))).toBe("1 h 1 min");
    expect(plain(formatDuration(3_725_400))).toBe("1 h 2 min 5 s");
  });

  it("aceita locale", () => {
    expect(plain(formatDuration(65_000, "en-US"))).toBe("1 min 5 sec");
  });

  it("rejeita duração negativa ou não finita", () => {
    expect(formatDuration(-1)).toBe(EMPTY);
    expect(formatDuration(Number.NaN)).toBe(EMPTY);
  });
});
