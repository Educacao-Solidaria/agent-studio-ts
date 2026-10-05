import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest";
import { server } from "../mocks/node.ts";
import { installBrowserMocks } from "./browser-mocks.ts";

// Request sem handler falha o teste: nenhum teste fala com a rede de verdade.
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(installBrowserMocks);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  server.resetHandlers();
});
afterAll(() => server.close());
