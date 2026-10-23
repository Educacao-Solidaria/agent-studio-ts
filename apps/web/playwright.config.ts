import { defineConfig, devices } from "@playwright/test";

// e2e do chat em streaming: o Vite em modo mock (MSW no navegador) serve a página do teste.
// ponytail: só Chromium; Firefox/WebKit é mais um `projects` e o `playwright install` deles.
export default defineConfig({
  testDir: "e2e",
  testIgnore: ["image/**", "pages/**", "stack/**", "visual/**"], // config própria: playwright.<pasta>.config.ts
  workers: 1, // a página é uma só e o stream é cronometrado: um teste por vez
  forbidOnly: true,
  expect: { timeout: 10_000 }, // o dev server compila sob demanda: runner lento não é falha
  reporter: [["list"]],
  use: { baseURL: "http://localhost:4319", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev:mock --port 4319 --strictPort",
    url: "http://localhost:4319/e2e/stream.html",
    reuseExistingServer: true,
  },
});
