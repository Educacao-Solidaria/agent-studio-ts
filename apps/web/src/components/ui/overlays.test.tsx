import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../test/render.tsx";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "./dialog.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip.tsx";

describe("Dialog", () => {
  it("abre com título acessível, prende o foco e devolve ao gatilho no Esc", async () => {
    const { user } = renderWithProviders(
      <Dialog>
        <DialogTrigger>Novo agente</DialogTrigger>
        <DialogContent>
          <DialogTitle>Criar agente</DialogTitle>
          <DialogDescription>Defina nome e modelo.</DialogDescription>
          <input aria-label="Nome" />
        </DialogContent>
      </Dialog>,
    );
    const trigger = screen.getByRole("button", { name: "Novo agente" });
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Criar agente" });
    expect(dialog.contains(document.activeElement)).toBe(true);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    // o Radix devolve o foco num setTimeout após desmontar
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("fecha pelo botão rotulado Fechar", async () => {
    const { user } = renderWithProviders(
      <Dialog defaultOpen>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Confirmar</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    await user.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("DropdownMenu", () => {
  it("abre pelo teclado e dispara onSelect do item", async () => {
    const onSelect = vi.fn();
    const { user } = renderWithProviders(
      <DropdownMenu>
        <DropdownMenuTrigger>Ações</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={onSelect}>Duplicar</DropdownMenuItem>
          <DropdownMenuItem disabled>Excluir</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    await user.tab();
    await user.keyboard("{Enter}");

    expect(screen.getByRole("menu")).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Excluir" }).getAttribute("aria-disabled")).toBe(
      "true",
    );
    await user.click(screen.getByRole("menuitem", { name: "Duplicar" }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("Tooltip", () => {
  it("aparece no foco do teclado e descreve o gatilho", async () => {
    const { user } = renderWithProviders(
      <Tooltip>
        <TooltipTrigger>Executar</TooltipTrigger>
        <TooltipContent>Roda o fluxo inteiro</TooltipContent>
      </Tooltip>,
    );
    await user.tab();

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip.textContent).toBe("Roda o fluxo inteiro");
    expect(screen.getByRole("button", { name: "Executar" }).getAttribute("aria-describedby")).toBe(
      tooltip.id,
    );
  });
});
