import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { MOCK_MODEL } from "../mocks/handlers.ts";
import { server } from "../mocks/node.ts";
import { loadPricing, OPENROUTER_MODELS_URL, parsePricing } from "./model-pricing.ts";

describe("parsePricing", () => {
  it("lê preço por token e janela; deixa de fora o que não é preço válido", () => {
    const pricing = (prompt: unknown, completion: unknown = "0.1") => ({ prompt, completion });
    const table = parsePricing({
      data: [
        { id: "a/ok", pricing: pricing("0.000003", "0.000015"), context_length: 200_000 },
        { id: "a/gratis", pricing: pricing("0", "0"), context_length: 1.5 },
        { id: "a/numero", pricing: pricing(0.1, 0.2), context_length: -1 },
        { id: "openrouter/auto", pricing: pricing("-1", "-1") },
        { id: "a/texto", pricing: pricing("abc") },
        { id: "a/vazio", pricing: pricing(" ") },
        { id: "a/infinito", pricing: pricing("Infinity") },
        { id: "a/sem-saida", pricing: { prompt: "0.1" } },
        { id: 7, pricing: pricing("0.1") },
        { id: "a/sem-preco" },
        null,
      ],
    });
    expect([...table]).toEqual([
      ["a/ok", { prompt: 0.000003, completion: 0.000015, contextLength: 200_000 }],
      ["a/gratis", { prompt: 0, completion: 0 }],
      ["a/numero", { prompt: 0.1, completion: 0.2 }],
    ]);
  });

  it("resposta sem lista vira tabela vazia", () => {
    for (const json of [null, undefined, "x", {}, { data: "x" }, { data: null }]) {
      expect(parsePricing(json).size).toBe(0);
    }
  });
});

describe("loadPricing", () => {
  it("busca uma vez e reaproveita; falha não fica guardada", async () => {
    let calls = 0;
    const model = { id: MOCK_MODEL, pricing: { prompt: "0.000001", completion: "0.000002" } };
    server.use(
      http.get(OPENROUTER_MODELS_URL, () =>
        ++calls === 1
          ? new HttpResponse(null, { status: 503 })
          : HttpResponse.json({ data: [model] }),
      ),
    );
    await expect(loadPricing()).rejects.toThrow("503");
    const [first, second] = await Promise.all([loadPricing(), loadPricing()]);
    expect(second).toBe(first);
    expect(await loadPricing()).toBe(first);
    expect(calls).toBe(2);
    expect(first.get(MOCK_MODEL)).toEqual({ prompt: 0.000001, completion: 0.000002 });
  });
});
