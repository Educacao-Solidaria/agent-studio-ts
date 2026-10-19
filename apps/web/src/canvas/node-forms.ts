import type {
  CacheNodeConfig,
  EvalNodeConfig,
  GatewayNodeConfig,
  PromptNodeConfig,
  RagNodeConfig,
} from "./domain.ts";

/**
 * Campo do formulário. `key` é chave da config do contrato do Luan (typo não compila); os limites
 * repetem os de `src/validation/schemas.ts`, e o node-forms.test confere os dois lados.
 */
export type Field<C = Record<string, unknown>> = {
  key: Extract<keyof C, string>;
  label: string;
  required?: boolean;
} & (
  | { kind: "text" | "textarea" | "list" }
  | { kind: "checkbox"; default: boolean }
  | { kind: "number"; min?: number; max?: number; step?: number }
  | { kind: "select" | "options"; options: Record<string, string> }
);

/** Rascunho do formulário: texto cru dos inputs, marcado/desmarcado e opções escolhidas. */
export type Draft = Record<string, string | boolean | string[]>;

const EVICT = { lru: "LRU", lfu: "LFU", fifo: "FIFO" };
const SEARCH = { dense: "Densa", sparse: "Esparsa", hybrid: "Híbrida" };
const KPIS = { relevance: "Relevância", latency: "Latência", accuracy: "Acurácia", cost: "Custo" };

const FORM_BY_TYPE = {
  gateway: [
    { key: "model", label: "Modelo", kind: "text", required: true },
    { key: "temperature", label: "Temperatura", kind: "number", min: 0, max: 2 },
    { key: "topP", label: "Top-p", kind: "number", min: 0, max: 1 },
    { key: "fallbackModels", label: "Modelos de reserva (separados por vírgula)", kind: "list" },
    { key: "stream", label: "Resposta em streaming", kind: "checkbox", default: true },
    { key: "systemPrompt", label: "Prompt de sistema", kind: "textarea" },
    { key: "timeoutMs", label: "Tempo limite (ms)", kind: "number", min: 1 },
  ] satisfies Field<GatewayNodeConfig>[],
  cache: [
    { key: "similarityThreshold", label: "Limiar de similaridade", kind: "number", min: 0, max: 1 },
    { key: "maxEntries", label: "Máximo de entradas", kind: "number", min: 1, step: 1 },
    { key: "ttlSeconds", label: "Validade (s)", kind: "number", min: 0, step: 1 },
    { key: "evictPolicy", label: "Política de descarte", kind: "select", options: EVICT },
  ] satisfies Field<CacheNodeConfig>[],
  rag: [
    { key: "collectionName", label: "Coleção", kind: "text", required: true },
    { key: "topK", label: "Top-k", kind: "number", min: 1, max: 100, step: 1 },
    { key: "minScore", label: "Score mínimo", kind: "number", min: 0, max: 1 },
    { key: "searchMode", label: "Modo de busca", kind: "select", options: SEARCH },
    { key: "rerank", label: "Reordenar resultados (rerank)", kind: "checkbox", default: true },
    { key: "rerankTopN", label: "Top-N do rerank", kind: "number", min: 1, step: 1 },
  ] satisfies Field<RagNodeConfig>[],
  prompt: [
    { key: "template", label: "Template", kind: "textarea", required: true },
    { key: "variables", label: "Variáveis (separadas por vírgula)", kind: "list" },
  ] satisfies Field<PromptNodeConfig>[],
  eval: [
    { key: "metrics", label: "Métricas", kind: "options", required: true, options: KPIS },
    { key: "minPassScore", label: "Nota mínima", kind: "number", min: 0, max: 1 },
    { key: "alertOnFailure", label: "Alertar quando falhar", kind: "checkbox", default: true },
  ] satisfies Field<EvalNodeConfig>[],
};

/** Campos do tipo de nó; tipo sem config no contrato (ex.: `custom`) não tem formulário. */
export function formFor(type: string): Field[] {
  return Object.hasOwn(FORM_BY_TYPE, type)
    ? (FORM_BY_TYPE[type as keyof typeof FORM_BY_TYPE] as Field[])
    : [];
}

/** Config → rascunho. Booleano ausente vale o default do schema (o checkbox não tem "vazio"). */
export function toDraft(config: Record<string, unknown>, fields: Field[]): Draft {
  return Object.fromEntries(
    fields.map((field) => {
      const value = config[field.key];
      if (field.kind === "checkbox")
        return [field.key, typeof value === "boolean" ? value : field.default];
      if (field.kind === "options")
        return [field.key, Array.isArray(value) ? value.map(String) : []];
      if (field.kind === "list") return [field.key, Array.isArray(value) ? value.join(", ") : ""];
      return [field.key, String(value ?? "")];
    }),
  );
}

/** Rascunho → config. Campo opcional vazio sai como `undefined`, e o schema aplica o default. */
export function fromDraft(draft: Draft, fields: Field[]): Record<string, unknown> {
  return Object.fromEntries(
    fields.map((field) => {
      const value = draft[field.key];
      if (typeof value !== "string") return [field.key, value];
      if (field.kind === "list") {
        return [
          field.key,
          value
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        ];
      }
      // Só o vazio de verdade: "  " passa no `required` e no min(1) do schema, e fica como está.
      if (value === "") return [field.key, undefined];
      return [field.key, field.kind === "number" ? Number(value) : value];
    }),
  );
}
