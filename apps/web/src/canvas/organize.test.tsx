import * as dagre from "@dagrejs/dagre";
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderFlowInstance } from "../test/flow.tsx";
import { layoutNodes } from "./auto-layout.ts";
import type { StudioEdge, StudioNode } from "./domain.ts";
import type { StudioFlowNode } from "./flow.ts";
import { StudioCanvas } from "./studio-canvas.tsx";

// O download do dagre falha quando o teste pede (rede caída no meio do import dinâmico).
const download = vi.hoisted(() => ({ fails: false }));
vi.mock("./auto-layout.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("./auto-layout.ts")>();
  const loadDagre = () =>
    download.fails ? Promise.reject(new Error("rede")) : original.loadDagre();
  return { ...original, loadDagre };
});

/** Fluxo bagunçado: o gateway à esquerda do prompt que o alimenta, a avaliação embaixo. */
const nodes: StudioNode[] = [
  { id: "gateway", type: "gateway", position: { x: 0, y: 0 }, state: "idle", data: {} },
  { id: "prompt", type: "prompt", position: { x: 500, y: 300 }, state: "idle", data: {} },
  { id: "eval", type: "eval", position: { x: 250, y: 600 }, state: "idle", data: {} },
];
const link = (source: string, sourceHandle: string, target: string, targetHandle: string) => ({
  id: `${source}-${target}`,
  ...{ source, sourceHandle, target, targetHandle },
});
const edges: StudioEdge[] = [
  link("prompt", "prompt", "gateway", "prompt"),
  link("gateway", "completion", "eval", "response"),
];

function setup(fails: boolean) {
  download.fails = fails;
  const result = renderFlowInstance(<StudioCanvas initialNodes={nodes} initialEdges={edges} />);
  const positions = () => result.flow.current.getNodes().map((node) => node.position);
  const undo = () => screen.getByRole<HTMLButtonElement>("button", { name: "Desfazer" });
  return { ...result, positions, undo };
}

describe("Organizar", () => {
  it("arruma o fluxo pelo dagre, reenquadra a vista e é uma entrada do desfazer", async () => {
    const { user, flow, positions, undo } = setup(false);
    const live = flow.current.getNodes() as StudioFlowNode[];
    const expected = layoutNodes(dagre, live, flow.current.getEdges());
    const before = flow.current.getViewport();
    await user.click(screen.getByRole("button", { name: "Organizar" }));

    await waitFor(() => expect(positions()).toEqual(expected.map((node) => node.position)));
    const [gateway, prompt, evaluation] = positions().map(({ x }) => x);
    expect(prompt).toBeLessThan(gateway as number);
    expect(gateway).toBeLessThan(evaluation as number);
    await waitFor(() => expect(flow.current.getViewport()).not.toEqual(before));

    await user.click(undo());
    expect(positions()).toEqual(nodes.map((node) => node.position));
    expect(undo().disabled).toBe(true);
  });

  it("se o algoritmo não chega, avisa e deixa o fluxo como estava", async () => {
    const { user, positions, undo } = setup(true);
    await user.click(screen.getByRole("button", { name: "Organizar" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(
      "Não foi possível organizar. Tente de novo; se o erro persistir, recarregue a página.",
    );
    expect(positions()).toEqual(nodes.map((node) => node.position));
    expect(undo().disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Organizar" }).disabled).toBe(
      false,
    );
  });
});
