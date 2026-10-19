import { describe, expect, it } from "vitest";
import { NODE_TYPES } from "./flow.ts";
import { formFor, fromDraft, toDraft } from "./node-forms.ts";

type Schema = {
  shape: Record<string, unknown>;
  safeParse(input: unknown): { success: boolean; data?: Record<string, unknown> };
};
// O schemas.ts do Luan não passa no tsc do apps/web (zod 4: `z.record` com 1 argumento, linha
// 65), e um import normal faria o typecheck checá-lo. O glob o carrega só em runtime, onde funciona.
const glob = import.meta.glob<Record<string, Schema>>("../../../../src/validation/schemas.ts", {
  eager: true,
});
const [schemas] = Object.values(glob);
/** Config mínima válida de cada tipo, para variar um campo por vez. */
const BASE: Record<string, [Schema | undefined, Record<string, unknown>]> = {
  gateway: [schemas?.GatewayNodeConfigSchema, { model: "m" }],
  cache: [schemas?.CacheNodeConfigSchema, {}],
  rag: [schemas?.RagNodeConfigSchema, { collectionName: "docs" }],
  prompt: [schemas?.PromptNodeConfigSchema, { template: "t" }],
  eval: [schemas?.EvalNodeConfigSchema, { metrics: ["relevance"] }],
};

describe("contrato com os schemas zod do Luan", () => {
  it("todo tipo com config no contrato tem formulário, e só eles", () => {
    expect(NODE_TYPES.filter((type) => formFor(type).length > 0)).toEqual(Object.keys(BASE));
  });

  for (const [type, [schema, base]] of Object.entries(BASE)) {
    it(`${type}: campos, limites, defaults e obrigatórios batem com o schema`, () => {
      if (!schema) throw new Error(`schema de ${type} não encontrado em src/validation/schemas.ts`);
      const ok = (key: string, value: unknown) =>
        schema.safeParse({ ...base, [key]: value }).success;
      for (const field of formFor(type)) {
        expect(Object.keys(schema.shape)).toContain(field.key);
        if (field.kind === "number") {
          for (const bound of [field.min, field.max])
            if (bound !== undefined) expect(ok(field.key, bound)).toBe(true);
          if (field.min !== undefined) expect(ok(field.key, field.min - 1)).toBe(false);
          if (field.max !== undefined) expect(ok(field.key, field.max + 1)).toBe(false);
          if (field.step === 1) expect(ok(field.key, (field.min ?? 0) + 1.5)).toBe(false);
        }
        if (field.kind === "checkbox")
          expect(schema.safeParse(base).data?.[field.key]).toBe(field.default);
        if (field.kind === "select") {
          for (const option of Object.keys(field.options)) expect(ok(field.key, option)).toBe(true);
          expect(ok(field.key, "outra")).toBe(false);
        }
        if (field.kind === "options") expect(ok(field.key, Object.keys(field.options))).toBe(true);
        if (field.required) {
          const empty = field.kind === "options" ? [] : undefined;
          expect(ok(field.key, empty)).toBe(false);
        }
      }
    });
  }
});

describe("rascunho", () => {
  it("ida e volta: texto cru, lista por vírgula, vazio opcional some, booleano ausente pega o default", () => {
    const fields = formFor("gateway");
    const draft = toDraft({ model: "m", temperature: 0, fallbackModels: ["a", "b"] }, fields);
    expect(draft).toMatchObject({
      temperature: "0",
      topP: "",
      fallbackModels: "a, b",
      stream: true,
    });

    const edited = { ...draft, model: "  ", fallbackModels: " a, ,b ", stream: false };
    const config = fromDraft(edited, fields);
    expect(config).toMatchObject({ model: "  ", temperature: 0, fallbackModels: ["a", "b"] });
    expect(config).toHaveProperty("topP", undefined);
    expect(config.stream).toBe(false);

    const evals = formFor("eval");
    const metrics = { metrics: ["latency", "cost"], minPassScore: 0.9, alertOnFailure: false };
    expect(fromDraft(toDraft(metrics, evals), evals)).toEqual(metrics);
  });

  it("tipo sem config no contrato ou desconhecido não tem formulário", () => {
    expect(formFor("custom")).toEqual([]);
    expect(formFor("constructor")).toEqual([]);
  });
});
