import { describe, expect, it } from "vitest";
import { DefaultNode } from "./default-node.tsx";
import { NODE_TYPES } from "./flow.ts";
import { buildNodeTypes, nodeTypes, sameNodeProps } from "./node-types.ts";

/** O componente dentro do `memo` do registro. */
const inner = (component: unknown) => (component as { type?: unknown }).type;

function GatewayNode() {
  return <div>gateway próprio</div>;
}

describe("buildNodeTypes", () => {
  it("sem arquivos em nodes/ todo tipo usa o DefaultNode", () => {
    const types = buildNodeTypes({});
    expect(Object.keys(types)).toEqual(NODE_TYPES);
    for (const type of NODE_TYPES) expect(inner(types[type])).toBe(DefaultNode);
  });

  it("nodes/<tipo>.tsx troca só o componente daquele tipo", () => {
    const types = buildNodeTypes({ "./nodes/gateway.tsx": { default: GatewayNode } });
    expect(inner(types.gateway)).toBe(GatewayNode);
    expect(inner(types.cache)).toBe(DefaultNode);
  });

  it("recusa arquivo com nome que não é tipo do contrato", () => {
    expect(() => buildNodeTypes({ "./nodes/gateway-node.tsx": { default: GatewayNode } })).toThrow(
      /"\.\/nodes\/gateway-node\.tsx" deve se chamar <tipo>\.tsx/,
    );
  });

  it("recusa arquivo sem export default", () => {
    expect(() => buildNodeTypes({ "./nodes/rag.tsx": {} })).toThrow(/exportar o componente/);
  });

  it("o memo ignora só a posição: dado, seleção ou arraste novos renderizam", () => {
    const props = {
      id: "a",
      data: {},
      selected: false,
      positionAbsoluteX: 0,
      positionAbsoluteY: 0,
    };
    const same = (next: object) => sameNodeProps(props as never, { ...props, ...next } as never);
    expect(same({ positionAbsoluteX: 40, positionAbsoluteY: 80 })).toBe(true);
    for (const next of [{ data: {} }, { selected: true }, { dragging: true }]) {
      expect(same(next)).toBe(false);
    }
  });

  it("o registro do app cobre todos os tipos", () => {
    expect(Object.keys(nodeTypes).sort()).toEqual([...NODE_TYPES].sort());
  });
});
