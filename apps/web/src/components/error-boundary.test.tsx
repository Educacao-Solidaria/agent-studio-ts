import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./error-boundary.tsx";

let shouldThrow = true;
function Flaky() {
  if (shouldThrow) throw new Error("falha no nó de RAG");
  return <p>Canvas carregado</p>;
}

// O React registra no console todo erro capturado; aqui ele é esperado.
beforeEach(() => {
  shouldThrow = true;
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("ErrorBoundary", () => {
  it("troca a subárvore quebrada por um alerta com foco no título", () => {
    render(
      <ErrorBoundary showDetails={false}>
        <Flaky />
      </ErrorBoundary>,
    );
    const alert = screen.getByRole("alert", { name: "Algo deu errado nesta tela" });
    expect(document.activeElement).toBe(screen.getByRole("heading"));
    expect(alert.textContent).not.toContain("falha no nó de RAG");
    expect(alert.querySelector("pre")).toBeNull();
  });

  it("mostra mensagem e stack quando showDetails está ligado", () => {
    render(
      <ErrorBoundary showDetails>
        <Flaky />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert").querySelector("pre")?.textContent).toContain(
      "falha no nó de RAG",
    );
  });

  it("tentar novamente remonta só a subárvore e preserva o estado de fora", () => {
    const onReset = vi.fn(() => {
      shouldThrow = false;
    });
    function Shell() {
      const [count, setCount] = useState(0);
      return (
        <>
          <button type="button" onClick={() => setCount((c) => c + 1)}>
            cliques: {count}
          </button>
          <ErrorBoundary onReset={onReset}>
            <Flaky />
          </ErrorBoundary>
        </>
      );
    }
    render(<Shell />);
    fireEvent.click(screen.getByRole("button", { name: "cliques: 0" }));

    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));

    expect(onReset).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Canvas carregado")).toBeTruthy();
    expect(screen.getByRole("button", { name: "cliques: 1" })).toBeTruthy();
  });

  it("volta ao alerta se o erro persistir após tentar de novo", () => {
    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});
