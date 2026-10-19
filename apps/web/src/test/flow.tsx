import { act, createEvent, fireEvent } from "@testing-library/react";
import { type ReactFlowInstance, ReactFlowProvider, useReactFlow } from "@xyflow/react";
import type { ReactElement } from "react";
import { vi } from "vitest";
import { triggerAllResizes } from "./browser-mocks.ts";
import { renderWithProviders } from "./render.tsx";

/** Tamanhos que o jsdom não calcula (nele offsetWidth/offsetHeight são sempre 0). */
export const FLOW_LAYOUT = {
  pane: { width: 1000, height: 700 },
  node: { width: 160, height: 56 },
  handle: { width: 8, height: 8 },
};

function stubSize(getter: "offsetWidth" | "offsetHeight", key: "width" | "height") {
  vi.spyOn(HTMLElement.prototype, getter, "get").mockImplementation(function (this: HTMLElement) {
    const { classList } = this;
    if (classList.contains("react-flow__handle")) return FLOW_LAYOUT.handle[key];
    return (classList.contains("react-flow__node") ? FLOW_LAYOUT.node : FLOW_LAYOUT.pane)[key];
  });
}

/**
 * render para telas com React Flow: dá tamanho aos elementos e dispara os ResizeObserver.
 * Sem medida o React Flow esconde os nós e não desenha arestas. O setup restaura os getters.
 */
export function renderFlow(ui: ReactElement) {
  stubSize("offsetWidth", "width");
  stubSize("offsetHeight", "height");
  const result = renderWithProviders(ui);
  act(() => triggerAllResizes());
  return result;
}

/** renderFlow com a instância do React Flow em `flow.current`, para comandar e ler a vista. */
export function renderFlowInstance(ui: ReactElement) {
  const flow = {} as { current: ReactFlowInstance };
  function Probe() {
    flow.current = useReactFlow();
    return null;
  }
  const result = renderFlow(
    <ReactFlowProvider>
      {ui}
      <Probe />
    </ReactFlowProvider>,
  );
  return { ...result, flow };
}

/**
 * Mouse de verdade para o d3-drag do React Flow no jsdom: o evento leva `view` (o user-event manda
 * null e o d3 quebra; o jsdom recusa `view` no construtor) e todo retângulo vale o canvas inteiro
 * (no 0 × 0 do jsdom o mouse estaria sempre na borda e o auto-pan moveria o nó sozinho). O primeiro
 * movimento só cruza o limiar de 1 px e não move; comece longe da borda de 40 px.
 */
export function mouseOn(element: Element) {
  const pane = DOMRectReadOnly.fromRect(FLOW_LAYOUT.pane) as DOMRect;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(pane);
  return (type: "mouseDown" | "mouseMove" | "mouseUp", x: number, y: number) => {
    const event = createEvent[type](element, { clientX: x, clientY: y });
    Object.defineProperty(event, "view", { value: window });
    fireEvent(element, event);
  };
}
