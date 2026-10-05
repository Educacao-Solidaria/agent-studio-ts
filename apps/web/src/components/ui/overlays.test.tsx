import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "./dialog.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu.tsx";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip.tsx";

describe("Dialog", () => {
  it("abre com título acessível, prende o foco e devolve ao gatilho no Esc", async () => {
    render(
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
    trigger.focus(); // como num clique real, o gatilho recebe o foco antes de abrir
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Criar agente" });
    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    // o Radix devolve o foco num setTimeout após desmontar
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("fecha pelo botão rotulado Fechar", () => {
    render(
      <Dialog defaultOpen>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Confirmar</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("DropdownMenu", () => {
  it("abre pelo teclado e dispara onSelect do item", () => {
    const onSelect = vi.fn();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Ações</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={onSelect}>Duplicar</DropdownMenuItem>
          <DropdownMenuItem disabled>Excluir</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    fireEvent.keyDown(screen.getByRole("button", { name: "Ações" }), { key: "Enter" });

    expect(screen.getByRole("menu")).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Excluir" }).getAttribute("aria-disabled")).toBe(
      "true",
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Duplicar" }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("Tooltip", () => {
  it("aparece no foco do teclado e descreve o gatilho", () => {
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>Executar</TooltipTrigger>
          <TooltipContent>Roda o fluxo inteiro</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    const trigger = screen.getByRole("button", { name: "Executar" });
    act(() => trigger.focus());

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.textContent).toBe("Roda o fluxo inteiro");
    expect(trigger.getAttribute("aria-describedby")).toBe(tooltip.id);
  });
});
