import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { ErrorBoundary } from "./components/error-boundary.tsx";
import "./styles/globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("Elemento #root não encontrado em index.html");

// Rede simulada só em `pnpm dev:mock`. Fora do dev o `if` é falso em tempo de build e o
// import dinâmico (MSW + handlers) é eliminado do bundle de produção.
if (import.meta.env.DEV && import.meta.env.MODE === "mock") {
  const { worker } = await import("./mocks/browser.ts");
  await worker.start({ onUnhandledRequest: "bypass" });
}

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
