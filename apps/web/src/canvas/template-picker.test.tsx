import { act, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderFlowInstance } from "../test/flow.tsx";
import type { StudioEdge, StudioNode } from "./domain.ts";
import { StudioCanvas } from "./studio-canvas.tsx";
import { loadTemplateDialog, TemplatePicker } from "./template-picker.tsx";
import { FLOW_TEMPLATES } from "./templates.ts";

const nodes: StudioNode[] = [
  { id: "a", type: "prompt", position: { x: 0, y: 0 }, state: "idle", data: {} },
  { id: "b", type: "gateway", position: { x: 300, y: 0 }, state: "idle", data: { model: "m1" } },
];
const edges: StudioEdge[] = [
  { id: "a-b", source: "a", sourceHandle: "prompt", target: "b", targetHandle: "prompt" },
];

function setup() {
  const view = renderFlowInstance(<StudioCanvas initialNodes={nodes} initialEdges={edges} />);
  const ids = () => ({
    nodes: view.flow.current.getNodes().map((node) => node.id),
    edges: view.flow.current.getEdges().map((edge) => edge.id),
  });
  const button = (name: string) => screen.getByRole<HTMLButtonElement>("button", { name });
  const pick = async (name: RegExp) => {
    await view.user.click(button("Modelos"));
    await view.user.click(await screen.findByRole("button", { name }));
  };
  return { ...view, ids, button, pick };
}

const rag = {
  nodes: ["prompt", "rag", "gateway"],
  edges: ["prompt-rag", "prompt-gateway", "rag-gateway"],
};

describe("Modelos", () => {
  it("sem alterações carrega direto, numa entrada só do desfazer", async () => {
    const { user, ids, button, pick } = setup();
    await pick(/^RAG simples/);

    expect(ids()).toEqual(rag);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(button("Modelos")); // o foco volta ao gatilho
    await user.click(button("Desfazer"));
    expect(ids()).toEqual({ nodes: ["a", "b"], edges: ["a-b"] });
    expect(button("Desfazer").disabled).toBe(true);
  });

  it("o modelo carregado vira a base: trocar por outro sem mexer não pergunta", async () => {
    const { ids, pick } = setup();
    await pick(/^RAG simples/);
    await pick(/^Roteador de modelos/);
    expect(ids().nodes).toEqual(FLOW_TEMPLATES[1]?.nodes.map((node) => node.id));
  });

  it("com alterações pede confirmação: Cancelar mantém, Substituir troca e o desfazer volta", async () => {
    const { user, flow, ids, button, pick } = setup();
    await act(() => flow.current.deleteElements({ nodes: [{ id: "b" }] }));
    const changed = ids();
    expect(changed).toEqual({ nodes: ["a"], edges: [] });

    await pick(/^RAG simples/);
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText(/O canvas tem alterações/).textContent).toContain("Ctrl+Z");
    await user.click(dialog.getByRole("button", { name: "Cancelar" }));
    expect(ids()).toEqual(changed);

    await user.click(screen.getByRole("button", { name: /^RAG simples/ }));
    await user.click(screen.getByRole("button", { name: "Substituir" }));
    expect(ids()).toEqual(rag);
    await user.click(button("Desfazer"));
    expect(ids()).toEqual(changed);
  });

  it("cada carga é uma cópia: editar o fluxo não muda o catálogo", async () => {
    const { flow, pick } = setup();
    await pick(/^RAG simples/);
    const loaded = flow.current.getNode("gateway")?.data as { config: unknown } | undefined;
    const original = FLOW_TEMPLATES[0]?.nodes.find((node) => node.id === "gateway")?.data;
    expect(loaded?.config).toEqual(original);
    expect(loaded?.config).not.toBe(original);
  });

  it("falha ao baixar o diálogo vira aviso; o próximo clique tenta de novo", async () => {
    const load = vi
      .fn<typeof loadTemplateDialog>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch dynamically imported module"))
      .mockImplementationOnce(loadTemplateDialog);
    const { user } = renderFlowInstance(<TemplatePicker load={load} />);
    const open = () => user.click(screen.getByRole("button", { name: "Modelos" }));
    await open();
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Não foi possível abrir os modelos. Tente de novo.",
    );
    expect(screen.queryByRole("dialog")).toBeNull();

    await open();
    expect(await screen.findByRole("button", { name: /^Agente autônomo com tools/ })).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(load).toHaveBeenCalledTimes(2);
  });
});
