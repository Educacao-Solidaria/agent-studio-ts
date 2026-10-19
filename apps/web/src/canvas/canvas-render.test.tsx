import { screen } from "@testing-library/react";
import { type NodeTypes, ReactFlow, useNodesState, useStoreApi } from "@xyflow/react";
import { type ReactNode, useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import { mouseOn, renderFlowInstance } from "../test/flow.tsx";
import { DefaultNode } from "./default-node.tsx";
import type { StudioEdge, StudioNode } from "./domain.ts";
import { type StudioFlowNode, toFlowNode } from "./flow.ts";
import { buildNodeTypes } from "./node-types.ts";
import { StudioCanvas } from "./studio-canvas.tsx";

// Contadores de render: cada embrulho conta e delega ao original. O `memo` que está em teste fica
// por fora do embrulho (no registro de nós e no canvas), então o que se conta é o que passa por ele.
const renders = vi.hoisted(() => ({ count: {} as Record<string, number>, store: 0 }));
const bump = (key: string) => {
  renders.count[key] = (renders.count[key] ?? 0) + 1;
};
function counting<P>(key: (props: P) => string, render: (props: P) => ReactNode) {
  return (props: P) => {
    bump(key(props));
    return render(props);
  };
}
vi.mock("./use-flow-history.ts", async (original) => {
  const real = await original<typeof import("./use-flow-history.ts")>();
  const hook = (...args: Parameters<typeof real.useFlowHistory>) => {
    bump("canvas"); // uma chamada por render do StudioCanvas
    return real.useFlowHistory(...args);
  };
  return { ...real, useFlowHistory: hook };
});
vi.mock("./default-node.tsx", async (original) => {
  const real = await original<typeof import("./default-node.tsx")>();
  return { ...real, DefaultNode: counting((p) => `node:${p.id}`, real.DefaultNode) };
});
vi.mock("./flow-edge.tsx", async (original) => {
  const real = await original<typeof import("./flow-edge.tsx")>();
  return { ...real, FlowEdge: counting((p) => `edge:${p.id}`, real.FlowEdge) };
});
vi.mock("./canvas-toolbar.tsx", async (original) => {
  const real = await original<typeof import("./canvas-toolbar.tsx")>();
  return { ...real, CanvasToolbar: counting(() => "toolbar", real.CanvasToolbar) };
});
vi.mock("./node-palette.tsx", async (original) => {
  const real = await original<typeof import("./node-palette.tsx")>();
  return { ...real, NodePalette: counting(() => "palette", real.NodePalette) };
});
vi.mock("./node-drawer.tsx", async (original) => {
  const real = await original<typeof import("./node-drawer.tsx")>();
  return { ...real, NodeDrawer: counting(() => "drawer", real.NodeDrawer) };
});

/** Conta as notificações do store do React Flow (cada uma roda todos os seletores dele). */
function StoreProbe() {
  const store = useStoreApi();
  useEffect(() => store.subscribe(() => void renders.store++), [store]);
  return null;
}

const nodes: StudioNode[] = ["a", "b", "c"].map((id, i) => ({
  ...{ id, type: i === 0 ? "prompt" : "gateway", position: { x: i * 300, y: 0 } },
  ...{ state: "idle", data: {} },
}));
const edges: StudioEdge[] = [
  { id: "a-b", source: "a", sourceHandle: "prompt", target: "b", targetHandle: "prompt" },
  { id: "b-c", source: "b", sourceHandle: "completion", target: "c", targetHandle: "prompt" },
];
const FRAMES = 10;

/** Arrasta o nó `a` por FRAMES quadros e devolve o que renderizou durante eles. */
function dragA() {
  const mouse = mouseOn(screen.getByTestId("rf__node-a"));
  mouse("mouseDown", 100, 100);
  mouse("mouseMove", 102, 100); // só cruza o limiar
  const snapshot = (): Record<string, number> => ({ ...renders.count, store: renders.store });
  const before = snapshot();
  for (let i = 1; i <= FRAMES; i++) mouse("mouseMove", 102 + i * 10, 100 + i * 5);
  const after = snapshot();
  mouse("mouseUp", 202, 150);
  return (key: string) => (after[key] ?? 0) - (before[key] ?? 0);
}

describe("render no arraste", () => {
  it("só o canvas e a aresta do nó acompanham o arraste; o resto fica parado", () => {
    const { flow } = renderFlowInstance(
      <>
        <StudioCanvas initialNodes={nodes} initialEdges={edges} />
        <StoreProbe />
      </>,
    );
    const during = dragA();

    // Controles: o arraste aconteceu e os contadores contam — o canvas (onde os nós vivem) e a
    // aresta ligada ao nó (o caminho dela muda) renderizam uma vez por quadro.
    expect(flow.current.getNode("a")?.position).toEqual({ x: 100, y: 50 });
    expect([during("canvas"), during("edge:a-b")]).toEqual([FRAMES, FRAMES]);
    // O nó arrastado está selecionado: o painel dele está aberto, e mesmo assim não renderiza.
    expect(screen.getByRole("complementary", { name: "Prompt" })).toBeDefined();
    const still = ["node:a", "node:b", "node:c", "edge:b-c", "palette", "drawer"];
    expect(still.map(during)).toEqual(still.map(() => 0));
    // A barra renderiza uma vez, quando o arraste começa: os comandos de desfazer/refazer trocam
    // (no meio do arraste eles não fazem nada) e ficam os mesmos até o fim.
    expect(during("toolbar")).toBe(1);
    // Uma atualização do store por quadro: a dos nós (o isValidConnection não muda mais junto).
    expect(during("store")).toBe(FRAMES);
  });

  it("controle negativo: sem o memo do registro, o nó arrastado renderiza a cada quadro", () => {
    const start = nodes.map(toFlowNode);
    function Bare({ types }: { types: NodeTypes }) {
      const [current, , onNodesChange] = useNodesState<StudioFlowNode>(start);
      return <ReactFlow nodes={current} nodeTypes={types} onNodesChange={onNodesChange} />;
    }
    const raw: NodeTypes = { prompt: DefaultNode, gateway: DefaultNode }; // o contador, sem memo
    const { unmount } = renderFlowInstance(<Bare types={raw} />);
    expect(dragA()("node:a")).toBe(FRAMES);
    unmount();

    renderFlowInstance(<Bare types={buildNodeTypes({})} />);
    expect(dragA()("node:a")).toBe(0);
  });
});
