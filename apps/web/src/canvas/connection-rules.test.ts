import { describe, expect, it } from "vitest";
import { type GraphView, type Link, refusalMessage, refuseConnection } from "./connection-rules.ts";

const nodes = [
  { id: "p", type: "prompt" },
  { id: "c", type: "cache" },
  { id: "r", type: "rag" },
  { id: "g", type: "gateway" },
  { id: "e", type: "eval" },
  { id: "x", type: "custom" },
];
const graph = (edges: Link[] = []): GraphView => ({ nodes, edges });
const link = (source: string, sourceHandle: string, target: string, targetHandle: string) => ({
  source,
  sourceHandle,
  target,
  targetHandle,
});

describe("refuseConnection", () => {
  it("aceita portas do mesmo tipo de dado e a porta `any` com qualquer uma", () => {
    expect(refuseConnection(link("c", "response", "g", "prompt"), graph())).toBeNull();
    expect(refuseConnection(link("r", "context", "g", "context"), graph())).toBeNull();
    expect(refuseConnection(link("r", "context", "x", "in"), graph())).toBeNull();
    expect(refuseConnection(link("x", "out", "g", "prompt"), graph())).toBeNull();
  });

  it("recusa tipos incompatíveis e diz quais são", () => {
    expect(refuseConnection(link("r", "context", "g", "prompt"), graph())).toEqual({
      reason: "incompatible",
      from: "documents",
      to: "text",
    });
  });

  it("recusa ligar um nó a ele mesmo", () => {
    expect(refuseConnection(link("c", "response", "c", "query"), graph())?.reason).toBe("self");
  });

  it("recusa ligação repetida, com handle null ou undefined dando no mesmo", () => {
    const existing = { source: "c", target: "g", sourceHandle: null, targetHandle: "prompt" };
    const again = { source: "c", target: "g", targetHandle: "prompt" };
    expect(refuseConnection(again, graph([existing]))?.reason).toBe("duplicate");
  });

  it("recusa porta que o tipo do nó não tem, nó sem saída e nó desconhecido", () => {
    const missing = { reason: "missing" };
    expect(refuseConnection(link("c", "nope", "g", "prompt"), graph())).toEqual(missing);
    expect(refuseConnection(link("e", "response", "g", "prompt"), graph())).toEqual(missing);
    expect(refuseConnection(link("?", "out", "g", "prompt"), graph())).toEqual(missing);
    const proto = { nodes: [...nodes, { id: "o", type: "constructor" }], edges: [] };
    expect(refuseConnection(link("o", "out", "g", "prompt"), proto)).toEqual(missing);
  });

  it("sem id de handle usa a primeira porta do lado, como o React Flow desenha", () => {
    expect(refuseConnection({ source: "r", target: "g" }, graph())?.reason).toBe("incompatible");
    expect(refuseConnection({ source: "c", target: "g" }, graph())).toBeNull();
  });

  it("recusa a ligação que fecharia um ciclo e aceita atalho que não fecha", () => {
    const chain = graph([link("c", "response", "g", "prompt"), link("g", "completion", "x", "in")]);
    expect(refuseConnection(link("x", "out", "c", "query"), chain)?.reason).toBe("cycle");
    expect(refuseConnection(link("c", "response", "x", "in"), chain)).toBeNull();
  });

  it("acha ciclo numa cadeia longa sem estourar a pilha", () => {
    const ids = Array.from({ length: 20_000 }, (_, i) => `n${i}`);
    const long: GraphView = {
      nodes: ids.map((id) => ({ id, type: "custom" })),
      edges: ids.slice(1).map((id, i) => link(`n${i}`, "out", id, "in")),
    };
    expect(refuseConnection(link("n19999", "out", "n0", "in"), long)?.reason).toBe("cycle");
  });
});

describe("refusalMessage", () => {
  it("explica cada recusa em pt-BR", () => {
    expect(refusalMessage({ reason: "incompatible", from: "documents", to: "text" })).toBe(
      "Saída de documentos não liga em entrada de texto.",
    );
    for (const reason of ["self", "missing", "duplicate", "cycle"] as const) {
      expect(refusalMessage({ reason })).toMatch(/^[A-Z].+\.$/);
    }
  });
});
