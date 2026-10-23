import { defineConfig } from "@playwright/test";

// O ecossistema do compose do flow-gateway-go de pé com este estúdio (job `stack` do CI): só
// pedidos HTTP, sem navegador, pela origem que o compose publica no host (contratos da Fase 5,
// §4). STUDIO_URL aponta outro estúdio que esteja na frente do backend.
export default defineConfig({
  testDir: "e2e/stack",
  forbidOnly: true,
  reporter: [["list"]],
  use: { baseURL: process.env.STUDIO_URL ?? "http://127.0.0.1:3000" },
});
