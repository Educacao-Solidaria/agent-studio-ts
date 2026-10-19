import { fireEvent, screen, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { act } from "react";
import { describe, expect, it } from "vitest";
import { mouseOn, renderFlowInstance } from "../test/flow.tsx";
import type { StudioEdge, StudioNode } from "./domain.ts";
import type { StudioFlowNode } from "./flow.ts";
import { StudioCanvas } from "./studio-canvas.tsx";

const nodes: StudioNode[] = [
  { id: "a", type: "prompt", position: { x: 0, y: 0 }, state: "idle", data: {} },
  { id: "b", type: "gateway", position: { x: 300, y: 0 }, state: "idle", data: { model: "m1" } },
];
const edges: StudioEdge[] = [
  { id: "a-b", source: "a", sourceHandle: "prompt", target: "b", targetHandle: "prompt" },
];

function setup() {
  const result = renderFlowInstance(<StudioCanvas initialNodes={nodes} initialEdges={edges} />);
  const { flow } = result;
  const button = (name: string) => screen.getByRole<HTMLButtonElement>("button", { name });
  const ids = () => ({
    nodes: flow.current.getNodes().map((node) => node.id),
    edges: flow.current.getEdges().map((edge) => edge.id),
  });
  const node = (id: string) => flow.current.getNode(id) as StudioFlowNode | undefined;
  return { ...result, button, ids, node };
}

/** Seleciona pelo teclado (foco + Enter) e apaga com Delete. */
async function remove(user: UserEvent, id: string) {
  act(() => screen.getByTestId(`rf__node-${id}`).focus());
  await user.keyboard("{Enter}{Delete}");
}

describe("desfazer e refazer no canvas", () => {
  it("apagar nó e aresta é uma entrada; Ctrl/Cmd+Z volta, Ctrl+Y e Ctrl+Shift+Z refazem", async () => {
    const { user, button, ids } = setup();
    expect(button("Desfazer").disabled).toBe(true);
    await remove(user, "a");
    expect(ids()).toEqual({ nodes: ["b"], edges: [] });

    await user.keyboard("{Control>}z{/Control}");
    expect(ids()).toEqual({ nodes: ["a", "b"], edges: ["a-b"] });
    expect(screen.getByTestId("rf__node-a").style.visibility).not.toBe("hidden");
    expect(button("Desfazer").disabled).toBe(true); // uma entrada só
    await user.keyboard("{Control>}y{/Control}");
    expect(ids()).toEqual({ nodes: ["b"], edges: [] });
    await user.keyboard("{Meta>}z{/Meta}");
    expect(ids().nodes).toEqual(["a", "b"]);
    await user.keyboard("{Control>}{Shift>}z{/Shift}{/Control}");
    expect(ids()).toEqual({ nodes: ["b"], edges: [] });
  });

  it("seleção não é entrada nem apaga o refazer; uma ação nova apaga", async () => {
    const { user, button, ids } = setup();
    await remove(user, "a");
    await user.click(button("Desfazer"));
    act(() => screen.getByTestId("rf__node-b").focus());
    await user.keyboard("{Enter}"); // seleciona b
    expect(button("Desfazer").disabled).toBe(true);
    expect(button("Refazer").disabled).toBe(false);

    await user.keyboard("{Delete}");
    expect(button("Refazer").disabled).toBe(true);
    await user.keyboard("{Control>}z{/Control}");
    expect(ids()).toEqual({ nodes: ["a", "b"], edges: ["a-b"] });
  });

  it("arrastar vira uma entrada só, gravada quando o arraste termina", async () => {
    const { user, button, node } = setup();
    const mouse = mouseOn(screen.getByTestId("rf__node-a"));
    /** Arrasta 100 × 80 em dois passos (o primeiro movimento só cruza o limiar de 1 px), longe
     * da borda de 40 px em que o auto-pan começa. */
    const drag = async (x: number, during?: () => Promise<void>) => {
      mouse("mouseDown", x + 100, 100);
      mouse("mouseMove", x + 102, 100);
      mouse("mouseMove", x + 152, 140);
      mouse("mouseMove", x + 202, 180);
      await during?.();
      mouse("mouseUp", x + 202, 180);
    };

    await drag(0);
    expect(node("a")?.position).toEqual({ x: 100, y: 80 });
    await drag(200, async () => {
      await user.keyboard("{Control>}z{/Control}"); // no meio do arraste não desfaz
      expect(node("a")?.position).toEqual({ x: 200, y: 160 });
    });
    await user.click(button("Desfazer"));
    expect(node("a")?.position).toEqual({ x: 100, y: 80 });
    await user.click(button("Desfazer"));
    expect(node("a")?.position).toEqual({ x: 0, y: 0 });
    expect(button("Desfazer").disabled).toBe(true);
  });

  it("salvar no painel é uma entrada; em campo de texto o Ctrl+Z é o nativo", async () => {
    const { user, button, node } = setup();
    act(() => screen.getByTestId("rf__node-b").focus());
    await user.keyboard("{Enter}");
    const drawer = within(screen.getByRole("complementary", { name: "Gateway" }));
    const model = drawer.getByLabelText("Modelo");
    await user.clear(model);
    await user.type(model, "m2");
    expect(button("Desfazer").disabled).toBe(true); // rascunho não é entrada
    await user.click(drawer.getByRole("button", { name: "Salvar" }));
    expect(node("b")?.data.config.model).toBe("m2");

    await user.type(model, "x");
    // fireEvent devolve false se alguém chamou preventDefault: o desfazer do texto segue.
    expect(fireEvent.keyDown(model, { key: "z", code: "KeyZ", ctrlKey: true })).toBe(true);
    expect(node("b")?.data.config.model).toBe("m2");

    await user.click(button("Desfazer"));
    expect(node("b")?.data.config).toEqual({ model: "m1" });
    expect(button("Desfazer").disabled).toBe(true);
  });

  it("estado de execução não é entrada, e desfazer mantém o estado de agora", async () => {
    const { user, flow, button, ids, node } = setup();
    await remove(user, "a");
    act(() => flow.current.updateNodeData("b", { state: "running" }));
    await user.keyboard("{Control>}z{/Control}");

    expect(ids().nodes).toEqual(["a", "b"]);
    expect(node("b")?.data.state).toBe("running");
    expect(button("Desfazer").disabled).toBe(true);
  });
});
