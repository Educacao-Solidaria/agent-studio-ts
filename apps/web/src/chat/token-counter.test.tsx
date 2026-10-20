import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MOCK_MODEL } from "../mocks/handlers.ts";
import { consumption, estimateTokens, TokenCounter } from "./token-counter.tsx";

const PRICE = { prompt: 0.000003, completion: 0.000015, contextLength: 200_000 };
const USAGE = { prompt_tokens: 1200, completion_tokens: 800, cached: false };

/** [rótulo, valor] de cada item, com o espaço fixo do Intl trocado por espaço comum. */
const items = (element: Element) =>
  [...element.querySelectorAll("dt")].map((dt) =>
    [dt.textContent, dt.nextElementSibling?.textContent].map((t) => t?.replace(/\s/g, " ")),
  );

describe("consumption", () => {
  it("estima ~4 caracteres por token enquanto o uso real não chega", () => {
    expect([estimateTokens(""), estimateTokens("abcd"), estimateTokens("abcde")]).toEqual([
      0, 1, 2,
    ]);
    const now = consumption({
      prompt: "a".repeat(400),
      completion: "b".repeat(40),
      pricing: PRICE,
    });
    expect(now).toEqual({
      ...{ promptTokens: 100, completionTokens: 10, totalTokens: 110, estimated: true },
      ...{ costUsd: 100 * 0.000003 + 10 * 0.000015, contextRatio: 110 / 200_000 },
    });
  });

  it("com o uso do gateway, o texto não conta mais", () => {
    const now = consumption({ usage: USAGE, prompt: "ignorado", pricing: PRICE });
    expect(now).toMatchObject({ totalTokens: 2000, estimated: false, contextRatio: 0.01 });
    expect(now.costUsd).toBeCloseTo(0.0156, 10);
  });

  it("metadata do começo do stream (saída em 0) não vira saída real com texto chegando", () => {
    const early = { ...USAGE, completion_tokens: 0 };
    const now = consumption({ usage: early, completion: "b".repeat(40) });
    expect(now).toMatchObject({ promptTokens: 1200, completionTokens: 10, estimated: true });
    expect(consumption({ usage: early, completion: "" })).toMatchObject({ estimated: false });
  });

  it("cache não cobra; sem preço ou janela fica indefinido; nada é zero", () => {
    const cached = { ...USAGE, cached: true };
    expect(consumption({ usage: cached, pricing: PRICE }).costUsd).toBe(0);
    expect(consumption({ usage: cached }).costUsd).toBe(0); // nem precisa saber o preço
    expect(consumption({ completion: "abc" })).toMatchObject({ costUsd: undefined });
    const free = consumption({ pricing: { prompt: 1, completion: 1 } });
    expect(free).toMatchObject({ totalTokens: 0, costUsd: 0, contextRatio: undefined });
  });
});

describe("TokenCounter", () => {
  it("estimativa enquanto o stream chega; o uso real tira o rótulo; preço injetado não busca", () => {
    const load = vi.fn();
    const props = { model: "x/y", pricing: PRICE, load, prompt: "a".repeat(400) };
    const view = render(<TokenCounter {...props} completion={"b".repeat(40)} />);
    expect(items(view.container)).toEqual([
      ["Entrada", "≈ 100"],
      ["Saída", "≈ 10"],
      ["Custo", "≈ US$ 0,00045"],
      ["Contexto", "0,1%"],
    ]);
    expect(view.getByText("estimativa")).toBeTruthy();
    view.rerender(<TokenCounter {...props} usage={USAGE} />);
    expect(items(view.container)).toEqual([
      ["Entrada", "1,2k"],
      ["Saída", "800"],
      ["Custo", "US$ 0,02"],
      ["Contexto", "1%"],
    ]);
    expect(view.queryByText("estimativa")).toBeNull();
    view.rerender(<TokenCounter {...props} usage={{ ...USAGE, cached: true }} />);
    expect(items(view.container)[2]).toEqual(["Custo", "US$ 0,00 (cache)"]);
    expect(load).not.toHaveBeenCalled();
  });

  it("sem preço injetado usa a tabela da OpenRouter; modelo fora dela fica sem custo", async () => {
    const known = render(<TokenCounter model={MOCK_MODEL} completion={"x".repeat(40)} />);
    const unknown = render(<TokenCounter model="x/fora-da-tabela" completion="abc" />);
    await waitFor(() => expect(items(known.container)[2]).toEqual(["Custo", "≈ US$ 0,00002"]));
    expect(items(known.container)[3]).toEqual(["Contexto", "0%"]);
    expect(items(unknown.container).map(([label]) => label)).toEqual(["Entrada", "Saída", "Custo"]);
    expect(items(unknown.container)[2]).toEqual(["Custo", "—"]);
  });

  it("tabela fora do ar e uso inválido não quebram: viram —", async () => {
    const load = vi.fn(() => Promise.reject(new Error("sem rede")));
    const usage = { prompt_tokens: Number.NaN, completion_tokens: 3, cached: false };
    const view = render(<TokenCounter model={MOCK_MODEL} usage={usage} load={load} />);
    await waitFor(() => expect(load).toHaveBeenCalledOnce());
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(items(view.container)).toEqual([
      ["Entrada", "—"],
      ["Saída", "3"],
      ["Custo", "—"],
    ]);
  });
});
