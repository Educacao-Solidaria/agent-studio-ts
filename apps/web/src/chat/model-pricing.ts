/** A lista pública de modelos da OpenRouter (sem chave): preço por token e janela de contexto. */
export const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

/** Dólares por token de entrada e de saída, e a janela de contexto em tokens. */
export type ModelPricing = { prompt: number; completion: number; contextLength?: number };
export type PricingTable = ReadonlyMap<string, ModelPricing>;

// A API manda string ("0.000003"); número também vale. Vazio não é zero.
const price = (value: unknown) => {
  const text = typeof value === "string" && value.trim() !== "";
  const usd = typeof value === "number" || text ? Number(value) : Number.NaN;
  return Number.isFinite(usd) && usd >= 0 ? usd : undefined;
};

type RawModel = { id?: unknown; pricing?: { prompt?: unknown; completion?: unknown } } & {
  context_length?: unknown;
};

/**
 * A resposta do `GET /models` como tabela por id. Entrada de terceiro, não confiável: fica de fora
 * o modelo sem id ou sem preço que seja um número ≥ 0 — inclusive o "-1" dos roteadores (o
 * `openrouter/auto` cobra o do modelo que escolher, que não se sabe antes); janela que não é
 * inteiro positivo some sem tirar o preço.
 */
export function parsePricing(json: unknown): PricingTable {
  const byId = new Map<string, ModelPricing>();
  const data = (json as { data?: unknown } | null)?.data;
  for (const model of Array.isArray(data) ? (data as RawModel[]) : []) {
    const prompt = price(model?.pricing?.prompt);
    const completion = price(model?.pricing?.completion);
    if (typeof model?.id !== "string" || prompt === undefined || completion === undefined) continue;
    const context = model.context_length;
    const contextLength =
      Number.isSafeInteger(context) && Number(context) > 0 ? Number(context) : 0;
    byId.set(model.id, { prompt, completion, ...(contextLength > 0 ? { contextLength } : {}) });
  }
  return byId;
}

let table: Promise<PricingTable> | undefined;

/**
 * A tabela da OpenRouter, buscada uma vez por sessão (são centenas de modelos e o preço muda
 * pouco) e reaproveitada por todo contador. Falha não fica guardada: a próxima chamada tenta de
 * novo. ponytail: cache só em memória; se a busca a cada recarga pesar, guardar a tabela compacta
 * no localStorage com validade.
 */
export function loadPricing(): Promise<PricingTable> {
  table ??= fetch(OPENROUTER_MODELS_URL, { headers: { Accept: "application/json" } })
    .then((response) => {
      if (!response.ok) throw new Error(`a lista de modelos respondeu ${response.status}`);
      return response.json();
    })
    .then(parsePricing)
    .catch((error: unknown) => {
      table = undefined;
      throw error;
    });
  return table;
}
