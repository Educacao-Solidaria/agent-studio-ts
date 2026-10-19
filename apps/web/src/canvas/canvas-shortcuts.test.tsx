import { fireEvent, screen, within } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it } from "vitest";
import { renderFlowInstance } from "../test/flow.tsx";
import type { StudioEdge, StudioNode } from "./domain.ts";
import { SHORTCUT_IDS, SHORTCUTS } from "./shortcuts.ts";
import { StudioCanvas } from "./studio-canvas.tsx";

const nodes: StudioNode[] = [
  { id: "prompt", type: "prompt", position: { x: 0, y: 0 }, state: "success", data: {} },
  { id: "gateway", type: "gateway", position: { x: 300, y: 0 }, state: "error", data: {} },
];
const edges: StudioEdge[] = [
  {
    id: "p-g",
    source: "prompt",
    sourceHandle: "prompt",
    target: "gateway",
    targetHandle: "prompt",
  },
];

function setup() {
  const result = renderFlowInstance(<StudioCanvas initialNodes={nodes} initialEdges={edges} />);
  const selected = () => ({
    nodes: result.flow.current.getNodes().flatMap((n) => (n.selected ? [n.id] : [])),
    edges: result.flow.current.getEdges().flatMap((e) => (e.selected ? [e.id] : [])),
  });
  return { ...result, selected };
}

/** Ctrl+tecla no elemento; devolve false se o atalho chamou preventDefault. */
const ctrl = (target: Element, key: string) =>
  fireEvent.keyDown(target, { key, code: `Key${key.toUpperCase()}`, ctrlKey: true });

describe("atalhos do canvas", () => {
  it("Ctrl+D duplica a seleção sem abrir os favoritos, e um Ctrl+Z desfaz", async () => {
    const { user, flow } = setup();
    const prompt = screen.getByTestId("rf__node-prompt");
    const description = document.getElementById(prompt.getAttribute("aria-describedby") ?? "");
    expect(description?.textContent).toContain("Ctrl+D duplica, Ctrl+Z desfaz");
    act(() => prompt.focus());
    await user.keyboard("{Enter}");

    expect(ctrl(document.activeElement as Element, "d")).toBe(false);
    expect(screen.getByTestId("rf__node-prompt-2").style.visibility).not.toBe("hidden");
    expect(flow.current.getNode("prompt-2")?.position).toEqual({ x: 40, y: 40 });
    expect(flow.current.getEdges()).toHaveLength(1); // a ligação com o gateway não vem junto
    await user.keyboard("{Control>}z{/Control}");
    expect(screen.queryByTestId("rf__node-prompt-2")).toBeNull();
  });

  it("Ctrl+A seleciona nós e arestas; no campo de texto o Ctrl+A é do campo", async () => {
    const { user, flow, selected } = setup();
    act(() => screen.getByTestId("rf__node-gateway").focus());
    await user.keyboard("{Enter}");
    const model = within(screen.getByRole("complementary", { name: "Gateway" })).getByLabelText(
      "Modelo",
    );
    expect(ctrl(model, "a")).toBe(true);
    expect(selected()).toEqual({ nodes: ["gateway"], edges: [] });

    expect(ctrl(screen.getByRole("heading", { name: "Gateway" }), "a")).toBe(false);
    expect(selected()).toEqual({ nodes: ["prompt", "gateway"], edges: ["p-g"] });

    // Tudo selecionado, Ctrl+D copia os dois e a ligação entre eles; um Ctrl+Z desfaz tudo.
    await user.keyboard("{Control>}d{/Control}");
    expect(selected().nodes).toEqual(["prompt-2", "gateway-2"]);
    expect(flow.current.getEdges().map((e) => [e.source, e.target])).toEqual([
      ["prompt", "gateway"],
      ["prompt-2", "gateway-2"],
    ]);
    await user.keyboard("{Control>}z{/Control}");
    expect(flow.current.getNodes()).toHaveLength(2);
    expect(flow.current.getEdges()).toHaveLength(1);
  });

  it("com Espaço segurado o nó deixa de ser arrastável: o arraste move a vista", async () => {
    const { user } = setup();
    const node = screen.getByTestId("rf__node-prompt");
    expect(node.classList.contains("nopan")).toBe(true);
    await user.keyboard("[Space>]");
    expect(node.classList.contains("draggable")).toBe(false);
    expect(node.classList.contains("nopan")).toBe(false);
    await user.keyboard("[/Space]");
    expect(node.classList.contains("draggable")).toBe(true);
  });

  it("o botão Atalhos abre a lista com cada atalho do mapa, e Esc fecha", async () => {
    const { user } = setup();
    const tools = within(screen.getByRole("group", { name: "Ferramentas do canvas" }));
    const button = tools.getByRole("button", { name: "Atalhos do teclado" });
    const list = document.getElementById(button.getAttribute("aria-controls") ?? "") as HTMLElement;
    expect(list.hidden).toBe(true);
    await user.click(button);
    expect([button.getAttribute("aria-expanded"), list.hidden]).toEqual(["true", false]);
    for (const id of SHORTCUT_IDS)
      expect(within(list).getByText(SHORTCUTS[id].label)).toBeDefined();
    for (const key of ["Ctrl+Z", "Ctrl+Shift+Z", "Ctrl+D", "Ctrl+A", "Delete", "Espaço"]) {
      expect(within(list).getByText(key)).toBeDefined();
    }
    await user.keyboard("{Escape}");
    expect(list.hidden).toBe(true);
  });
});
