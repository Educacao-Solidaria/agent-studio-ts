import { act, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NodeStateMachine } from "../../../../src/state/stateMachine.ts";
import { renderFlowInstance } from "../test/flow.tsx";
import type { NodeTransitionEvent, StudioEdge, StudioNode } from "./domain.ts";
import { STATE_COLORS } from "./flow.ts";
import { createStatusStore, type ExecutionSource } from "./node-status.ts";
import { StudioCanvas } from "./studio-canvas.tsx";

// Contadores de render: cada render do StudioCanvas chama o useFlowHistory uma vez, e cada nó
// é um DefaultNode. Os dois embrulhos só contam e delegam ao original.
const renders = vi.hoisted(() => ({ canvas: 0, nodes: {} as Record<string, number> }));
vi.mock("./use-flow-history.ts", async (importOriginal) => {
  const { useFlowHistory } = await importOriginal<typeof import("./use-flow-history.ts")>();
  return {
    useFlowHistory: (...args: Parameters<typeof useFlowHistory>) => {
      renders.canvas++;
      return useFlowHistory(...args);
    },
  };
});
vi.mock("./default-node.tsx", async (importOriginal) => {
  const { DefaultNode } = await importOriginal<typeof import("./default-node.tsx")>();
  return {
    DefaultNode: (props: Parameters<typeof DefaultNode>[0]) => {
      renders.nodes[props.id] = (renders.nodes[props.id] ?? 0) + 1;
      return DefaultNode(props);
    },
  };
});

const nodes: StudioNode[] = ["a", "b", "c"].map((id, i) => ({
  ...{ id, type: i === 0 ? "prompt" : "gateway", position: { x: i * 300, y: 0 } },
  ...{ state: "idle", data: {} },
}));
const edges: StudioEdge[] = [
  { id: "a-b", source: "a", sourceHandle: "prompt", target: "b", targetHandle: "prompt" },
];
const node = (id: string) => screen.getByTestId(`rf__node-${id}`);

describe("createStatusStore", () => {
  it("guarda a última transição por nó e avisa só quem assina aquele nó", () => {
    const store = createStatusStore();
    const [onA, onB] = [vi.fn(), vi.fn()];
    const stopA = store.subscribe("a", onA);
    store.subscribe("b", onB);
    const event = (to: NodeTransitionEvent["to"], extra = {}): NodeTransitionEvent => ({
      ...{ nodeId: "a", from: "idle", to, timestamp: 0 },
      ...extra,
    });

    store.apply(event("error", { error: "falhou", durationMs: 120 }));
    expect(store.get("a")).toEqual({ state: "error", error: "falhou", durationMs: 120 });
    // O erro só vale em erro; a duração fica até a próxima medida.
    store.apply(event("running", { error: "antigo" }));
    expect(store.get("a")).toEqual({ state: "running", error: undefined, durationMs: 120 });
    expect([onA.mock.calls.length, onB.mock.calls.length]).toEqual([2, 0]);
    stopA();
    store.apply(event("success"));
    expect(onA).toHaveBeenCalledTimes(2);
    expect(store.get("nenhum")).toBeUndefined();
  });
});

describe("status ao vivo no canvas", () => {
  it("transição da NodeStateMachine do Luan muda só o nó dela: nem o canvas nem os outros", () => {
    const machine = new NodeStateMachine();
    const { flow } = renderFlowInstance(
      <StudioCanvas initialNodes={nodes} initialEdges={edges} execution={machine} />,
    );
    const before = { canvas: renders.canvas, nodes: { ...renders.nodes } };
    act(() => void machine.transition("a", "running"));

    expect(within(node("a")).getByText("Executando")).toBeDefined();
    const spinner = node("a").querySelector("svg")?.getAttribute("class");
    expect(spinner).toContain("motion-safe:animate-spin"); // parado com prefers-reduced-motion
    expect(renders.canvas).toBe(before.canvas);
    expect(renders.nodes.a).toBe((before.nodes.a ?? 0) + 1);
    expect([renders.nodes.b, renders.nodes.c]).toEqual([before.nodes.b, before.nodes.c]);
    // Não passa pelo estado do React Flow, então também não entra no desfazer.
    expect(flow.current.getNode("a")?.data.state).toBe("idle");
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Desfazer" }).disabled).toBe(true);
  });

  it("sucesso fica verde com duração, erro fica vermelho com a mensagem; aresta e mini-mapa juntos", () => {
    const machine = new NodeStateMachine();
    renderFlowInstance(
      <StudioCanvas initialNodes={nodes} initialEdges={edges} execution={machine} />,
    );
    const now = vi.spyOn(Date, "now").mockReturnValue(1000);
    act(() => void machine.transition("a", "running"));
    now.mockReturnValue(2500);
    act(() => void machine.transition("a", "success"));
    act(() => void machine.transition("b", "running"));

    expect(within(node("a")).getByText("Concluído")).toBeDefined();
    expect(within(node("a")).getByText("1,5 s")).toBeDefined();
    expect(node("a").querySelector("svg")?.getAttribute("class")).not.toContain("animate-spin");
    const edge = screen.getByTestId("rf__edge-a-b");
    expect(edge.querySelector('[data-flow="active"]')).not.toBeNull(); // a entregou, b executa

    act(() => void machine.transition("b", "error", "Chave da API inválida"));
    expect(within(node("b")).getByText("Erro")).toBeDefined();
    expect(within(node("b")).getByText("Chave da API inválida")).toBeDefined();
    expect(node("b").firstElementChild?.classList.contains("border-danger")).toBe(true);
    const fills = [...document.querySelectorAll<SVGElement>(".react-flow__minimap-node")].map(
      (rect) => rect.style.fill,
    );
    expect(fills).toEqual([STATE_COLORS.success, STATE_COLORS.error, STATE_COLORS.idle]);
  });

  it("assina a fonte uma vez e desliga ao desmontar", () => {
    const stop = vi.fn();
    const source: ExecutionSource = { subscribeDetailed: vi.fn(() => stop) };
    const { unmount } = renderFlowInstance(
      <StudioCanvas initialNodes={nodes} execution={source} />,
    );
    expect(source.subscribeDetailed).toHaveBeenCalledTimes(1);
    unmount();
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
