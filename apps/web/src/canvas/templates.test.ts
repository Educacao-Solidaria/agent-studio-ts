import { describe, expect, it } from "vitest";
import { ExecutionGraph } from "../../../../src/graph/executionGraph.ts";
import { type Link, refuseConnection } from "./connection-rules.ts";
import { NODE_TYPES } from "./flow.ts";
import { FLOW_TEMPLATES } from "./templates.ts";

type Schema = { safeParse(input: unknown): { success: boolean } };
type Schemas = Record<string, Schema> & {
  validatePipeline(input: unknown): { success: boolean; errors?: string[] };
};
// Pelo glob, como no node-forms.test: o schemas.ts do Luan não passa no tsc do apps/web (zod 4).
const [schemas] = Object.values(
  import.meta.glob<Schemas>("../../../../src/validation/schemas.ts", { eager: true }),
);
/** O schema da config do tipo, pela convenção do Luan: `<Tipo>NodeConfigSchema`. */
const configSchema = (type: string) =>
  schemas?.[`${type.charAt(0).toUpperCase()}${type.slice(1)}NodeConfigSchema`];

describe("catálogo de modelos", () => {
  it("os três exemplos do item, com ids distintos", () => {
    const names = FLOW_TEMPLATES.map((template) => template.name).join(" | ");
    expect(names).toBe("RAG simples | Roteador de modelos | Agente autônomo com tools");
    expect(new Set(FLOW_TEMPLATES.map((template) => template.id)).size).toBe(3);
  });

  for (const template of FLOW_TEMPLATES) {
    describe(template.name, () => {
      it("cada aresta, entrando uma a uma, passa no validador do canvas (PR 27)", () => {
        // Porta existente no tipo, tipos de dado compatíveis, sem repetida e sem ciclo.
        const accepted: Link[] = [];
        for (const edge of template.edges) {
          const graph = { nodes: template.nodes, edges: accepted };
          expect(refuseConnection(edge, graph), edge.id).toBeNull();
          accepted.push(edge);
        }
      });

      it("ids únicos, tipos do contrato e grafo aceito pelo ExecutionGraph do Luan", () => {
        const ids = template.nodes.map((node) => node.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(new Set(template.edges.map((edge) => edge.id)).size).toBe(template.edges.length);
        for (const node of template.nodes) expect(NODE_TYPES).toContain(node.type);
        const graph = new ExecutionGraph(template.nodes, template.edges);
        expect(graph.validate()).toEqual({ valid: true, errors: [] });
      });

      it("config de cada nó passa no schema zod do Luan, e o fluxo no validatePipeline", () => {
        for (const node of template.nodes) {
          if (node.type === "custom") continue; // o único tipo sem config no contrato
          expect(configSchema(node.type)?.safeParse(node.data).success, node.id).toBe(true);
        }
        const pipeline = { name: template.name, nodes: template.nodes, edges: template.edges };
        expect(schemas?.validatePipeline(pipeline)).toMatchObject({ success: true });
      });
    });
  }

  it("o agente desenrola o laço de propósito: fechá-lo seria recusado como ciclo", () => {
    const agent = FLOW_TEMPLATES.find((template) => template.id === "agente-com-tools");
    if (!agent) throw new Error("modelo do agente sumiu do catálogo");
    const loop = { source: "sintetizador", sourceHandle: "completion" };
    const back = { ...loop, target: "planejador", targetHandle: "prompt" };
    expect(refuseConnection(back, agent)).toEqual({ reason: "cycle" });
    const closed = [...agent.edges, { id: "laco", ...back }];
    expect(new ExecutionGraph(agent.nodes, closed).detectCycle()).toBe(true);
  });
});
