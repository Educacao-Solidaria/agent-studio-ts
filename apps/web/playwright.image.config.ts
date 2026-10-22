import { defineConfig, devices } from "@playwright/test";

// e2e da imagem de produção (job `e2e` do CI): o Studio servido pelo nginx do container, com os
// cabeçalhos de segurança. Sem Docker, STUDIO_URL aponta um nginx com a mesma config.
const url = process.env.STUDIO_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "e2e/image",
  forbidOnly: true,
  reporter: [["list"]],
  use: { baseURL: url, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // A imagem já construída (nada vem de registry), endurecida como no smoke (docker/smoke.sh).
  webServer: process.env.STUDIO_URL
    ? undefined
    : {
        command:
          "docker run --rm --pull never --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges -p 127.0.0.1:3000:3000 educacao-solidaria/agent-studio:dev",
        url,
        gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
      },
});
