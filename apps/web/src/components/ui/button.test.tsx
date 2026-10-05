import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button.tsx";

describe("Button", () => {
  it("é um botão type=button por padrão, para não submeter formulários sem querer", () => {
    render(<Button>Salvar</Button>);
    expect(screen.getByRole("button", { name: "Salvar" }).getAttribute("type")).toBe("button");
  });

  it("aplica variante e tamanho e mantém a className recebida", () => {
    render(
      <Button variant="danger" size="sm" className="w-full">
        Excluir
      </Button>,
    );
    const { className } = screen.getByRole("button");
    expect(className).toContain("bg-danger");
    expect(className).toContain("h-8");
    expect(className).toContain("w-full");
  });

  it("não dispara onClick quando desabilitado", () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Enviar
      </Button>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("com asChild renderiza o filho com o estilo do botão", () => {
    render(
      <Button asChild variant="ghost">
        <a href="/fluxos">Fluxos</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Fluxos" });
    expect(link.className).toContain("hover:bg-accent");
    expect(link.hasAttribute("type")).toBe(false);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
