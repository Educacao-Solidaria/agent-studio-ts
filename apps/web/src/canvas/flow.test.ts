import { describe, expect, it } from "vitest";
import type { StudioNode } from "./domain.ts";
import { toFlowEdge, toFlowNode } from "./flow.ts";

describe("flow", () => {
  it("toFlowNode leva a configuração para data.config e o estado de execução junto", () => {
    const studio: StudioNode = {
      id: "g1",
      type: "gateway",
      position: { x: 10, y: -20 },
      state: "error",
      error: "timeout",
      lastExecutionDurationMs: 0,
      data: { model: "m" },
    };
    const { data, ...node } = toFlowNode(studio);

    expect(node).toEqual({ id: "g1", type: "gateway", position: { x: 10, y: -20 } });
    expect(data).toEqual({
      config: { model: "m" },
      state: "error",
      error: "timeout",
      lastExecutionDurationMs: 0,
    });
  });

  it("toFlowEdge leva o animated para data.active e nomeia a conexão em pt-BR", () => {
    expect(toFlowEdge({ id: "e", source: "a", target: "b", sourceHandle: "out" })).toEqual({
      id: "e",
      source: "a",
      target: "b",
      sourceHandle: "out",
      data: { active: false },
      ariaLabel: "Conexão de a para b",
    });
    expect(toFlowEdge({ id: "e", source: "a", target: "b", animated: true }).data).toEqual({
      active: true,
    });
  });
});
