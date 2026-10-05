import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "./badge.tsx";
import { Input } from "./input.tsx";
import { Textarea } from "./textarea.tsx";

describe("Input", () => {
  it("fica acessível pelo rótulo e repassa eventos", () => {
    render(
      <>
        <label htmlFor="agent-name">Nome do agente</label>
        <Input id="agent-name" defaultValue="" />
      </>,
    );
    const input = screen.getByLabelText<HTMLInputElement>("Nome do agente");
    fireEvent.change(input, { target: { value: "Roteador" } });
    expect(input.value).toBe("Roteador");
    expect(input.type).toBe("text");
  });

  it("expõe o estado inválido para tecnologia assistiva", () => {
    render(<Input aria-label="E-mail" aria-invalid />);
    expect(screen.getByLabelText("E-mail").getAttribute("aria-invalid")).toBe("true");
  });
});

describe("Textarea", () => {
  it("usa 4 linhas por padrão e aceita sobrescrever", () => {
    render(<Textarea aria-label="Prompt" />);
    render(<Textarea aria-label="Notas" rows={8} />);
    expect(screen.getByLabelText("Prompt").getAttribute("rows")).toBe("4");
    expect(screen.getByLabelText("Notas").getAttribute("rows")).toBe("8");
  });
});

describe("Badge", () => {
  it("aplica a variante de status", () => {
    render(<Badge variant="success">ativo</Badge>);
    expect(screen.getByText("ativo").className).toContain("bg-success");
  });
});
