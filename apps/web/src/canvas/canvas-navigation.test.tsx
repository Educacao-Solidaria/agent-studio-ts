import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it } from "vitest";
import { FLOW_LAYOUT, renderFlowInstance } from "../test/flow.tsx";
import type { StudioNode } from "./domain.ts";
import { STATE_COLORS } from "./flow.ts";
import { MAX_ZOOM, MIN_ZOOM, StudioCanvas } from "./studio-canvas.tsx";

const nodes: StudioNode[] = [
  { id: "a", type: "prompt", position: { x: 0, y: 0 }, state: "success", data: {} },
  { id: "b", type: "gateway", position: { x: 300, y: 200 }, state: "running", data: {} },
  { id: "c", type: "eval", position: { x: 2400, y: 900 }, state: "error", data: {} },
];

const minimap = () => screen.getByRole("img", { name: "Mini-mapa do fluxo" });
const button = (name: string) => screen.getByRole<HTMLButtonElement>("button", { name });

describe("navegação do canvas", () => {
  it("o mini-mapa desenha cada nó na cor do estado dele", () => {
    renderFlowInstance(<StudioCanvas initialNodes={nodes} />);

    const rects = [...minimap().querySelectorAll<SVGElement>(".react-flow__minimap-node")];
    expect(rects.map((rect) => rect.style.fill)).toEqual(nodes.map((n) => STATE_COLORS[n.state]));
  });

  it("clicar no mini-mapa centraliza a vista no ponto, mantendo o zoom", () => {
    const { flow } = renderFlowInstance(<StudioCanvas initialNodes={nodes} />);
    act(() => void flow.current.zoomTo(0.5));

    // No jsdom (sem getScreenCTM) o React Flow entrega o ponto do clique sem converter o viewBox.
    fireEvent.click(minimap(), { clientX: 400, clientY: 100 });

    const { pane } = FLOW_LAYOUT;
    expect(flow.current.getViewport()).toEqual({
      x: pane.width / 2 - 400 * 0.5,
      y: pane.height / 2 - 100 * 0.5,
      zoom: 0.5,
    });
  });

  it("os controles aproximam e afastam, e desligam o botão no limite do zoom", async () => {
    const { user, flow } = renderFlowInstance(<StudioCanvas initialNodes={nodes} />);
    expect(screen.getByLabelText("Controles de zoom")).toBeDefined();
    const zoom = flow.current.getZoom();

    await user.click(button("Aproximar"));
    expect(flow.current.getZoom()).toBeCloseTo(zoom * 1.2);
    await user.click(button("Afastar"));
    expect(flow.current.getZoom()).toBeCloseTo(zoom);

    act(() => void flow.current.zoomTo(MAX_ZOOM));
    expect(button("Aproximar").disabled).toBe(true);
    act(() => void flow.current.zoomTo(MIN_ZOOM));
    expect(button("Afastar").disabled).toBe(true);
    expect(button("Aproximar").disabled).toBe(false);
  });

  it("enquadrar volta à vista da abertura; não há botão de travar o canvas", async () => {
    const { user, flow } = renderFlowInstance(<StudioCanvas initialNodes={nodes} />);
    const opening = flow.current.getViewport();
    act(() => void flow.current.setViewport({ x: -900, y: 40, zoom: 1.7 }));

    await user.click(button("Enquadrar o fluxo"));

    // Sem nó mudando, o React Flow aplica o fitView no próximo requestAnimationFrame.
    await waitFor(() => expect(flow.current.getViewport()).toEqual(opening));
    const controls = within(screen.getByLabelText("Controles de zoom"));
    expect(controls.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
      "Aproximar",
      "Afastar",
      "Enquadrar o fluxo",
    ]);
  });

  it("canvas vazio: mini-mapa sem nós e enquadrar não mexe na vista", async () => {
    const { user, flow } = renderFlowInstance(<StudioCanvas />);

    expect(minimap().querySelectorAll(".react-flow__minimap-node")).toHaveLength(0);
    await user.click(button("Enquadrar o fluxo"));
    await act(() => new Promise(requestAnimationFrame));
    expect(flow.current.getViewport()).toEqual({ x: 0, y: 0, zoom: 1 });
  });
});
