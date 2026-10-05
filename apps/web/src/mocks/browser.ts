import { setupWorker } from "msw/browser";
import { createHandlers } from "./handlers.ts";

/** Só é importado por main.tsx em `vite --mode mock`; nunca entra no build de produção. */
export const worker = setupWorker(...createHandlers());
