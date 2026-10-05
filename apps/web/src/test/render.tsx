import { type RenderOptions, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement, ReactNode } from "react";
import { TooltipProvider } from "../components/ui/tooltip.tsx";

/** Os providers que o app monta na raiz; teste de componente não precisa repetir. */
function Providers({ children }: { children: ReactNode }) {
  return <TooltipProvider delayDuration={0}>{children}</TooltipProvider>;
}

/** render do RTL com os providers do app e um user-event já configurado. */
export function renderWithProviders(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  return { user: userEvent.setup(), ...render(ui, { wrapper: Providers, ...options }) };
}
