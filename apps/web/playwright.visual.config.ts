import { readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import { THEMES } from "./e2e/catalog.ts";
import { BASELINE_DIR, notOfficial } from "./e2e/visual/baseline.ts";

// Regressão visual (job `visual` do CI): o Studio e o catálogo de stories, um projeto por tema,
// contra os PNG de e2e/visual/__snapshots__. Fora do ambiente em que os PNG nasceram (a imagem
// oficial do Playwright da versão exata do @playwright/test), recusa em vez de comparar ou gravar.
const { devDependencies } = JSON.parse(
  readFileSync(new URL("package.json", import.meta.url), "utf8"),
);
const refusal = notOfficial(devDependencies["@playwright/test"]);
if (refusal) throw new Error(refusal);

const url = "http://127.0.0.1:4320";

export default defineConfig({
  testDir: "e2e/visual",
  snapshotPathTemplate: `${BASELINE_DIR}/{arg}{-projectName}{ext}`,
  workers: 1,
  forbidOnly: true,
  // Limiar por pixel (distância YIQ): o padrão, 0,2, aceita ~50 níveis de cinza, e uma borda do
  // tema escuro 0,1 mais clara (oklch) passava. Com 0,03 (~8 níveis) a troca de token reprova.
  // O prazo cobre o dev server, que compila sob demanda: runner lento não é falha.
  expect: { timeout: 10_000, toHaveScreenshot: { threshold: 0.03 } },
  reporter: [["list"]],
  // A mesma foto a cada volta: o toHaveScreenshot já congela animação e esconde o cursor; aqui
  // ficam fixos o movimento reduzido (os gráficos não animam), o fuso e o idioma.
  use: {
    baseURL: url,
    timezoneId: "UTC",
    locale: "pt-BR",
    contextOptions: { reducedMotion: "reduce" },
  },
  projects: THEMES.map((theme) => ({
    name: theme,
    use: { ...devices["Desktop Chrome"], colorScheme: theme },
  })),
  webServer: {
    command: "pnpm dev --host 127.0.0.1 --port 4320 --strictPort",
    url: `${url}/e2e/stories.html`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
