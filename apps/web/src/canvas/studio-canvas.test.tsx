import { screen, within } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it } from "vitest";
import { FLOW_LAYOUT, renderFlow, renderFlowInstance } from "../test/flow.tsx";
import type { StudioEdge, StudioNode } from "./domain.ts";
import { MAX_ZOOM, MIN_ZOOM, StudioCanvas } from "./studio-canvas.tsx";

const nodes: StudioNode[] = [
  { id: "a", type: "prompt", position: { x: 0, y: 0 }, state: "success", data: {} },
  {
    id: "b",
    type: "gateway",
    position: { x: 300, y: 0 },
    state: "error",
    error: "Chave da API inválida",
    lastExecutionDurationMs: 1500,
    data: { model: "openrouter/mock-model" },
  },
];
const edges: StudioEdge[] = [{ id: "a-b", source: "a", target: "b" }];

/** O viewport aplicado: `translate(xpx, ypx) scale(zoom)` no estilo do elemento. */
function viewport() {
  const style = document.querySelector<HTMLElement>(".react-flow__viewport")?.style.transform;
  const [x, y, zoom] = (style?.match(/-?[\d.]+/g) ?? []).map(Number);
  return { x, y, zoom };
}

describe("StudioCanvas", () => {
  it("desenha cada nó medido, com tipo, estado, erro, duração e portas, e as arestas", () => {
    renderFlow(<StudioCanvas initialNodes={nodes} initialEdges={edges} />);

    const prompt = screen.getByTestId("rf__node-a");
    expect(prompt.style.visibility).not.toBe("hidden");
    expect(within(prompt).getByText("Prompt")).toBeDefined();
    expect(within(prompt).getByText("Concluído")).toBeDefined();
    // Portas do tipo (NODE_PORTS): o prompt só tem saída; o gateway, prompt e contexto.
    const handles = (node: HTMLElement, kind: string) =>
      [...node.querySelectorAll(`.react-flow__handle.${kind}`)].map((h) => h.getAttribute("title"));
    expect(handles(prompt, "target")).toEqual([]);
    expect(handles(prompt, "source")).toEqual(["Prompt (texto)"]);
    expect(handles(screen.getByTestId("rf__node-b"), "target")).toEqual([
      "Prompt (texto)",
      "Contexto (documentos)",
    ]);

    const gateway = within(screen.getByTestId("rf__node-b"));
    for (const text of ["Gateway", "Erro", "Chave da API inválida", "1,5 s"]) {
      expect(gateway.getByText(text)).toBeDefined();
    }
    expect(screen.getByTestId("rf__edge-a-b").querySelector("path")?.getAttribute("d")).toMatch(
      /^M/,
    );
  });

  it("centraliza o fluxo na abertura sem ampliar além de 100%", () => {
    renderFlow(<StudioCanvas initialNodes={nodes} initialEdges={edges} />);

    // Nós em x 0 e 300 com 160 de largura: caixa de 460 × 56 no centro do pane de 1000 × 700.
    const { pane, node } = FLOW_LAYOUT;
    expect(viewport()).toEqual({
      x: pane.width / 2 - 460 / 2,
      y: pane.height / 2 - node.height / 2,
      zoom: 1,
    });
  });

  it("abre vazio sem nós nem arestas", () => {
    renderFlow(<StudioCanvas />);

    expect(document.querySelector(".react-flow__pane")).not.toBeNull();
    expect(document.querySelectorAll(".react-flow__node")).toHaveLength(0);
    expect(viewport()).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it("limita o zoom entre MIN_ZOOM e MAX_ZOOM", () => {
    const { flow } = renderFlowInstance(<StudioCanvas initialNodes={nodes} />);

    act(() => void flow.current.zoomTo(50));
    expect(flow.current.getZoom()).toBe(MAX_ZOOM);
    act(() => void flow.current.zoomTo(0.001));
    expect(flow.current.getZoom()).toBe(MIN_ZOOM);
  });

  it("descreve o teclado em pt-BR, seleciona com Enter e remove nó e arestas com Delete", async () => {
    const { user } = renderFlow(<StudioCanvas initialNodes={nodes} initialEdges={edges} />);
    const node = screen.getByTestId("rf__node-a");
    const description = document.getElementById(node.getAttribute("aria-describedby") ?? "");
    expect(description?.textContent).toMatch(/^Enter ou Espaço seleciona o nó/);

    act(() => node.focus());
    await user.keyboard("{Enter}");
    await user.keyboard("{Delete}");

    expect(screen.queryByTestId("rf__node-a")).toBeNull();
    expect(screen.queryByTestId("rf__edge-a-b")).toBeNull();
    expect(screen.getByTestId("rf__node-b")).toBeDefined();
  });

  it("clicar em duas portas liga só o que o validador aceita", async () => {
    const flow: StudioNode[] = [
      { id: "c", type: "cache", position: { x: 0, y: 0 }, state: "idle", data: {} },
      { id: "r", type: "rag", position: { x: 0, y: 200 }, state: "idle", data: {} },
      { id: "g", type: "gateway", position: { x: 300, y: 100 }, state: "idle", data: {} },
    ];
    const start = [
      { id: "c-g", source: "c", sourceHandle: "response", target: "g", targetHandle: "prompt" },
    ];
    const { user } = renderFlow(<StudioCanvas initialNodes={flow} initialEdges={start} />);
    const port = (node: string, id: string) =>
      document.querySelector(`.react-flow__handle[data-nodeid="${node}"][data-handleid="${id}"]`);
    const connect = async (from: [string, string], to: [string, string]) => {
      await user.click(port(...from) as Element);
      await user.click(port(...to) as Element);
    };
    const edgeCount = () => document.querySelectorAll(".react-flow__edge").length;

    await connect(["r", "context"], ["g", "prompt"]); // documentos → texto
    await connect(["g", "completion"], ["c", "query"]); // fecharia c → g → c
    await connect(["c", "response"], ["c", "query"]); // o próprio nó
    expect(edgeCount()).toBe(1);

    await connect(["r", "context"], ["g", "context"]);
    expect(edgeCount()).toBe(2);
    expect(screen.getByLabelText("Conexão de r para g")).toBeDefined();
  });
});
