import { screen } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it } from "vitest";
import { NodeStateMachine } from "../../../../src/state/stateMachine.ts";
import css from "../styles/globals.css?raw";
import { renderFlow, renderFlowInstance } from "../test/flow.tsx";
import type { NodeExecutionState, StudioEdge, StudioNode } from "./domain.ts";
import { isTransmitting, pulseDuration } from "./flow-edge.tsx";
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
const pulse = (id: string) => edge(id).querySelector<SVGElement>('[data-flow="pulse"]');

const STATES: NodeExecutionState[] = ["idle", "queued", "running", "success", "error"];

describe("isTransmitting", () => {
  it("dado em trânsito: destino executando e origem com saída (concluída ou em streaming)", () => {
    const pairs = STATES.flatMap((source) => STATES.map((target) => [source, target] as const));
    // As 25 combinações: só estas duas transmitem.
    expect(pairs.filter(([source, target]) => isTransmitting(source, target))).toEqual([
      ["running", "running"],
      ["success", "running"],
    ]);
    expect(isTransmitting(undefined, "running")).toBe(false); // nó sem estado (fora do canvas)
    expect(isTransmitting("success", undefined)).toBe(false);
  });
});

describe("pulseDuration", () => {
  it("velocidade constante: dobra com a aresta, entre 0,6 s e 3 s, e NaN não vaza", () => {
    expect(pulseDuration(0, 0, 240, 0)).toBe(1000);
    expect(pulseDuration(0, 0, 288, 384)).toBe(2000); // corda de 480 px
    expect(pulseDuration(10, 10, 10, 10)).toBe(600); // aresta de comprimento 0
    expect(pulseDuration(0, 0, 10_000, 0)).toBe(3000);
    expect(pulseDuration(Number.NaN, 0, 100, 0)).toBe(1200);
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
    const { flow } = renderFlowInstance(<StudioCanvas initialNodes={nodes} initialEdges={edges} />);

    act(() => flow.current.updateNodeData("c", { state: "running" }));
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

  it("o pulso anda pelo caminho da própria aresta, só onde há dado em trânsito", () => {
    renderFlow(<StudioCanvas initialNodes={nodes} initialEdges={edges} />);

    const d = edge("a-b").querySelector(".react-flow__edge-path")?.getAttribute("d");
    expect(d).toMatch(/^M/);
    expect(pulse("a-b")?.style.getPropertyValue("--flow-pulse-path")).toBe(`path("${d}")`);
    expect(pulse("a-b")?.classList).toContain("animate-flow-pulse");
    expect(pulse("a-b")?.style.animationDuration).toMatch(/^\d+ms$/);
    expect(pulse("b-c")).toBeNull();
  });

  it("pulso ligado e desligado pelo status ao vivo da NodeStateMachine", () => {
    const machine = new NodeStateMachine();
    const idle = nodes.map((node) => ({ ...node, state: "idle" as const }));
    renderFlow(<StudioCanvas initialNodes={idle} initialEdges={edges} execution={machine} />);
    const step = (id: string, to: NodeExecutionState) => act(() => void machine.transition(id, to));

    step("a", "running");
    expect(pulse("a-b")).toBeNull(); // a ainda não mandou nada: b está ocioso
    step("b", "running");
    expect(pulse("a-b")).not.toBeNull(); // streaming: os dois executando
    step("a", "success");
    expect(pulse("a-b")).not.toBeNull(); // a entregou, b consome
    step("b", "error");
    expect([pulse("a-b"), pulse("b-c")]).toEqual([null, null]);
  });

  it("para a animação com prefers-reduced-motion; o pulso fica parado no meio, com o sentido", () => {
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(/--animate-flow-dash: none;/);
    expect(reduced).toMatch(/--animate-flow-pulse: none;/);
    expect(css).toMatch(/--animate-flow-dash: flow-dash [^;]+;/);
    expect(css).toMatch(/--animate-flow-pulse: flow-pulse [^;]+;/);
    const rule = css.slice(
      css.indexOf(".flow-pulse {"),
      css.indexOf("}", css.indexOf(".flow-pulse {")),
    );
    expect(rule).toMatch(/offset-path: var\(--flow-pulse-path\);/);
    expect(rule).toMatch(/offset-distance: 50%;/); // sem animação, a seta fica no meio
    expect(rule).toMatch(/offset-rotate: auto;/); // e aponta o destino, pelo caminho
  });
});
