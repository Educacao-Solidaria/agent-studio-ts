import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { installBrowserMocks } from "./browser-mocks.ts";

beforeEach(installBrowserMocks);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
