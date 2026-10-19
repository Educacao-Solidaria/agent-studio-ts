import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderFlowInstance } from "../test/flow.tsx";
import { FALLBACK_SIZE } from "./auto-layout.ts";
import type { StudioNode } from "./domain.ts";
import { matchNodeTypes } from "./node-palette.tsx";
import { StudioCanvas } from "./studio-canvas.tsx";

const nodes: StudioNode[] = [
  { id: "prompt", type: "prompt", position: { x: 0, y: 0 }, state: "success", data: {} },
];

function setup() {
  const result = renderFlowInstance(<StudioCanvas initialNodes={nodes} />);
  const palette = () => screen.queryByRole("dialog", { name: "Adicionar nó" });
  const inPalette = () => within(palette() as HTMLElement);
  return { ...result, palette, inPalette };
}

describe("matchNodeTypes", () => {
  it("busca no nome e na descrição, sem acento nem caixa, com todas as palavras", () => {
    expect(matchNodeTypes(" ")).toEqual(["gateway", "cache", "rag", "prompt", "eval", "custom"]);
    for (const query of ["avaliacao", "AVALIAÇÃO", "qualidade"]) {
      expect(matchNodeTypes(query), query).toEqual(["eval"]);
    }
    expect(matchNodeTypes("semantico")).toEqual(["cache"]);
    expect(matchNodeTypes("hibrido  rag")).toEqual(["rag"]);
    expect(matchNodeTypes("modelo")).toEqual(["gateway"]);
    expect(matchNodeTypes("rag modelo")).toEqual([]);
  });
});

describe("NodePalette", () => {
  it("duplo clique no fundo abre a paleta sem zoom; Enter insere no ponto e Ctrl+Z desfaz", async () => {
    const { user, flow, palette, inPalette } = setup();
    const zoom = flow.current.getZoom();
    const pane = document.querySelector(".react-flow__pane") as Element;
    fireEvent.doubleClick(pane, { clientX: 300, clientY: 200 });
    // Com o zoom do React Flow ligado, o duplo clique aproximaria numa transição de 250 ms.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(flow.current.getZoom()).toBe(zoom);

    const search = inPalette().getByRole("combobox", { name: "Buscar tipo de nó" });
    expect(document.activeElement).toBe(search);
    await user.type(search, "aval");
    const [option, ...rest] = inPalette().getAllByRole("option");
    expect([option?.textContent, rest.length]).toEqual([
      "AvaliaçãoMede a qualidade da resposta",
      0,
    ]);
    expect(search.getAttribute("aria-activedescendant")).toBe(option?.id);
    await user.keyboard("{Enter}");

    expect(palette()).toBeNull();
    const at = flow.current.screenToFlowPosition({ x: 300, y: 200 });
    const inserted = flow.current.getNode("eval");
    expect(inserted?.position).toEqual({
      x: at.x - FALLBACK_SIZE.width / 2,
      y: at.y - FALLBACK_SIZE.height / 2,
    });
    expect(inserted?.selected).toBe(true);
    await user.keyboard("{Control>}z{/Control}");
    expect(flow.current.getNode("eval")).toBeUndefined();
  });

  it("pela barra: setas dão a volta na lista e Esc fecha sem inserir, com o foco de volta", async () => {
    const { user, flow, palette, inPalette } = setup();
    const button = screen.getByRole("button", { name: "Adicionar nó" });
    await user.click(button);
    const search = inPalette().getByRole("combobox");
    const active = () =>
      document.getElementById(search.getAttribute("aria-activedescendant") ?? "")?.textContent;

    expect(active()).toMatch(/^Gateway/);
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(active()).toMatch(/^RAG híbrido/);
    await user.keyboard("{ArrowUp}{ArrowUp}{ArrowUp}");
    expect(active()).toMatch(/^Personalizado/);
    await user.keyboard("{Escape}");
    expect(palette()).toBeNull();
    expect(flow.current.getNodes()).toHaveLength(1);
    await waitFor(() => expect(document.activeElement).toBe(button));
  });

  it("sem resultado avisa e o Enter não insere; clicar numa opção insere e seleciona", async () => {
    const { user, flow, palette, inPalette } = setup();
    act(() => screen.getByTestId("rf__node-prompt").focus());
    await user.keyboard("{Enter}"); // prompt selecionado: a seleção passa para o nó novo
    await user.click(screen.getByRole("button", { name: "Adicionar nó" }));
    const search = inPalette().getByRole("combobox");
    await user.type(search, "xyz{Enter}");
    expect(inPalette().queryAllByRole("option")).toHaveLength(0);
    expect(inPalette().getByRole("status").textContent).toBe("Nenhum tipo de nó encontrado.");
    expect(palette()).not.toBeNull();

    await user.clear(search);
    await user.click(inPalette().getByRole("option", { name: /^Cache semântico/ }));
    expect(palette()).toBeNull();
    const selected = flow.current.getNodes().map((node) => [node.id, node.selected === true]);
    expect(selected).toEqual([
      ["prompt", false],
      ["cache", true],
    ]);
  });

  it("duplo clique num nó não abre a paleta", () => {
    const { palette } = setup();
    fireEvent.doubleClick(screen.getByTestId("rf__node-prompt"));
    expect(palette()).toBeNull();
  });
});
