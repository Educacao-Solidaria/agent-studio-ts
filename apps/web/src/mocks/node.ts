import { setupServer } from "msw/node";
import { createHandlers } from "./handlers.ts";

/** Servidor de mocks do vitest: sem atraso entre chunks para o teste não esperar à toa. */
export const server = setupServer(...createHandlers({ chunkDelayMs: 0 }));
