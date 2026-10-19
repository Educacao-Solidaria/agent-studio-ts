import { screen, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { act } from "react";
import { describe, expect, it } from "vitest";
import { renderFlowInstance } from "../test/flow.tsx";
import type { StudioNode } from "./domain.ts";
import { StudioCanvas } from "./studio-canvas.tsx";

const nodes: StudioNode[] = [
  {
    id: "g",
    type: "gateway",
    position: { x: 0, y: 0 },
    state: "idle",
    // `apiKeyRef` não está no formulário: salvar não pode apagá-la.
    data: { model: "openrouter/mock-model", temperature: 0.5, apiKeyRef: "cofre/openrouter" },
  },
  { id: "c", type: "cache", position: { x: 300, y: 0 }, state: "idle", data: {} },
  { id: "x", type: "custom", position: { x: 600, y: 0 }, state: "idle", data: {} },
];

function setup() {
  const result = renderFlowInstance(<StudioCanvas initialNodes={nodes} />);
  const config = (id: string) => result.flow.current.getNode(id)?.data.config;
  return { ...result, config };
}

/** Seleciona o nó como no teclado (foco + Enter) e devolve o painel aberto. */
async function open(user: UserEvent, id: string, title: string) {
  act(() => screen.getByTestId(`rf__node-${id}`).focus());
  await user.keyboard("{Enter}");
  return within(screen.getByRole("complementary", { name: title }));
}

describe("NodeDrawer", () => {
  it("abre com o formulário do tipo, preenchido pela config, e o foco no título", async () => {
    const { user } = setup();
    const drawer = await open(user, "g", "Gateway");

    expect(drawer.getByLabelText("Modelo")).toHaveProperty("value", "openrouter/mock-model");
    expect(drawer.getByLabelText("Temperatura")).toHaveProperty("value", "0.5");
    expect(drawer.getByLabelText("Resposta em streaming")).toHaveProperty("checked", true);
    expect(document.activeElement).toBe(drawer.getByRole("heading", { name: "Gateway" }));
    act(() => drawer.getByRole("button", { name: "Fechar" }).focus());
    await user.keyboard("{Delete}{Backspace}"); // em botão do painel a tecla não apaga o nó
    expect(screen.getByTestId("rf__node-g")).toBeDefined();

    const custom = await open(user, "x", "Personalizado");
    expect(custom.getByText("Sem propriedades editáveis neste tipo.")).toBeDefined();
  });

  it("salvar grava na config sem apagar o que o formulário não mostra", async () => {
    const { user, config } = setup();
    const drawer = await open(user, "g", "Gateway");
    await user.clear(drawer.getByLabelText("Modelo"));
    await user.type(drawer.getByLabelText("Modelo"), "openai/gpt-x");
    expect(drawer.getByText("Alterações não salvas")).toBeDefined();

    await user.click(drawer.getByRole("button", { name: "Salvar" }));

    expect(config("g")).toMatchObject({
      model: "openai/gpt-x",
      temperature: 0.5,
      stream: true,
      apiKeyRef: "cofre/openrouter",
    });
    expect(drawer.queryByText("Alterações não salvas")).toBeNull();
  });

  it("valor fora do limite ou obrigatório vazio não salva", async () => {
    const { user, config } = setup();
    const drawer = await open(user, "g", "Gateway");
    const temperature = drawer.getByLabelText<HTMLInputElement>("Temperatura");
    await user.clear(temperature);
    await user.type(temperature, "3");
    await user.click(drawer.getByRole("button", { name: "Salvar" }));
    expect(temperature.validity.rangeOverflow).toBe(true);

    await user.clear(temperature);
    await user.clear(drawer.getByLabelText("Modelo"));
    await user.click(drawer.getByRole("button", { name: "Salvar" }));
    expect(drawer.getByLabelText<HTMLInputElement>("Modelo").validity.valueMissing).toBe(true);
    expect(config("g")).toMatchObject({ model: "openrouter/mock-model", temperature: 0.5 });
  });

  it("trocar de nó sem salvar guarda o rascunho, que volta ao reabrir", async () => {
    const { user, config } = setup();
    let drawer = await open(user, "g", "Gateway");
    await user.type(drawer.getByLabelText("Modelo"), "-rascunho");

    drawer = await open(user, "c", "Cache semântico");
    expect(drawer.getByLabelText("Política de descarte")).toHaveProperty("value", "");
    drawer = await open(user, "g", "Gateway");

    expect(drawer.getByLabelText("Modelo")).toHaveProperty(
      "value",
      "openrouter/mock-model-rascunho",
    );
    expect(drawer.getByText("Alterações não salvas")).toBeDefined();
    expect(config("g")).toMatchObject({ model: "openrouter/mock-model" });

    await user.click(drawer.getByRole("button", { name: "Descartar" }));
    expect(drawer.getByLabelText("Modelo")).toHaveProperty("value", "openrouter/mock-model");
  });

  it("Esc (e o botão fechar) fecha o painel, guarda o rascunho e devolve o foco ao nó", async () => {
    const { user } = setup();
    const drawer = await open(user, "c", "Cache semântico");
    await user.type(drawer.getByLabelText("Máximo de entradas"), "500");

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("complementary")).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId("rf__node-c"));
    const reopened = await open(user, "c", "Cache semântico");
    expect(reopened.getByLabelText("Máximo de entradas")).toHaveProperty("value", "500");
    await user.click(reopened.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("complementary")).toBeNull();
  });
});
