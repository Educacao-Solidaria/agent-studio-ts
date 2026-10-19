import { screen } from "@testing-library/react";
import { ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { act } from "react";
import { describe, expect, it } from "vitest";
import css from "../styles/globals.css?raw";
import { renderFlow } from "../test/flow.tsx";
import type { NodeExecutionState, StudioEdge, StudioNode } from "./domain.ts";
import { isTransmitting } from "./flow-edge.tsx";
import { StudioCanvas } from "./studio-canvas.tsx";

const node = (id: string, x: number, state: NodeExecutionState): StudioNode => ({
  id,
  type: "custom",
  position: { x, y: 0 },
  state,
  data: {},
});
const nodes = [node("a", 0, "success"), node("b", 300, "running"), node("c", 600, "idle")];
const edges: StudioEdge[] = [
  { id: "a-b", source: "a", target: "b" },
  { id: "b-c", source: "b", target: "c" },
];

const edge = (id: string) => screen.getByTestId(`rf__edge-${id}`);
const stops = (id: string) =>
  [...edge(id).querySelectorAll("stop")].map((stop) => stop.style.stopColor);
const isActive = (id: string) => edge(id).querySelector('[data-flow="active"]') !== null;

describe("isTransmitting", () => {
  it("só há dado em trânsito com o destino executando e a origem com saída", () => {
    expect(isTransmitting("success", "running")).toBe(true);
    expect(isTransmitting("running", "running")).toBe(true);
    for (const source of ["idle", "queued", "error", undefined] as const) {
      expect(isTransmitting(source, "running")).toBe(false);
    }
    for (const target of ["idle", "queued", "success", "error", undefined] as const) {
      expect(isTransmitting("success", target)).toBe(false);
    }
  });
});

describe("FlowEdge", () => {
  it("cada aresta pinta com o próprio gradiente, de id único, sem traço inline", () => {
    renderFlow(<StudioCanvas initialNodes={nodes} initialEdges={edges} />);

    const ids = edges.map(({ id }) => edge(id).querySelector("linearGradient")?.id);
    expect(new Set(ids).size).toBe(edges.length);
    edges.forEach(({ id }, i) => {
      const path = edge(id).querySelector<SVGElement>(".react-flow__edge-path");
      expect(path?.style.getPropertyValue("--flow-edge-stroke")).toBe(`url(#${ids[i]})`);
      // `stroke` inline venceria as regras de seleção e de foco do teclado do React Flow.
      expect(path?.style.stroke).toBe("");
    });
  });

  it("o gradiente vai da cor do estado da origem para a do destino", () => {
    renderFlow(<StudioCanvas initialNodes={nodes} initialEdges={edges} />);

    expect(stops("a-b")).toEqual(["var(--color-success)", "var(--color-primary)"]);
    expect(stops("b-c")).toEqual(["var(--color-primary)", "var(--color-muted-foreground)"]);
  });

  it("indica fluxo ativo só onde há dado em trânsito, com a animação do tema", () => {
    renderFlow(<StudioCanvas initialNodes={nodes} initialEdges={edges} />);

    expect(isActive("a-b")).toBe(true);
    expect(edge("a-b").querySelector('[data-flow="active"]')?.classList).toContain(
      "animate-flow-dash",
    );
    expect(isActive("b-c")).toBe(false);
  });

  it("acompanha ao vivo o estado dos nós", () => {
    let flow: ReturnType<typeof useReactFlow> | undefined;
    function Probe() {
      flow = useReactFlow();
      return null;
    }
    renderFlow(
      <ReactFlowProvider>
        <StudioCanvas initialNodes={nodes} initialEdges={edges} />
        <Probe />
      </ReactFlowProvider>,
    );

    act(() => flow?.updateNodeData("c", { state: "running" }));
    expect(isActive("b-c")).toBe(true);
    expect(stops("b-c")).toEqual(["var(--color-primary)", "var(--color-primary)"]);
  });

  it("o animated do contrato liga o indicador sem a animação própria do React Flow", () => {
    const flagged: StudioEdge = { id: "b-c", source: "b", target: "c", animated: true };
    renderFlow(<StudioCanvas initialNodes={nodes} initialEdges={[flagged]} />);

    expect(isActive("b-c")).toBe(true);
    expect(edge("b-c").classList).not.toContain("animated");
    expect(edge("b-c").getAttribute("aria-label")).toBe("Conexão de b para c");
  });

  it("para a animação com prefers-reduced-motion", () => {
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(/--animate-flow-dash: none;/);
    expect(css).toMatch(/--animate-flow-dash: flow-dash [^;]+;/);
  });
});
