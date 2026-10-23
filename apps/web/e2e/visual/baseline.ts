import { readFileSync } from "node:fs";

// Onde os PNG de referência da regressão visual moram (relativo a apps/web) e o único ambiente em
// que eles nascem e são comparados: o do job `visual` do CI. Navegador, fontes e libs do sistema
// mudam o pixel; PNG de outra máquina mediria a máquina, não o app.
export const BASELINE_DIR = "e2e/visual/__snapshots__";

/** A imagem oficial do Playwright para a versão do pacote (a tag que o job `visual` fixa). */
export const officialImage = (version: string) => `mcr.microsoft.com/playwright:v${version}-noble`;

/** A imagem em que este processo roda, pelo `/ms-playwright/.docker-info` que a imagem oficial
 * grava quando é gerada (`playwright-core mark-docker-image`). Fora dela, undefined. */
export function runningImage(file = "/ms-playwright/.docker-info"): string | undefined {
  try {
    const { dockerImageName } = JSON.parse(readFileSync(file, "utf8"));
    return typeof dockerImageName === "string" ? dockerImageName : undefined;
  } catch {
    return undefined;
  }
}

/** Por que este processo não pode gerar nem comparar os PNG; undefined quando pode: a imagem
 * oficial da versão exata do @playwright/test, em linux/amd64 como o runner do CI. */
export function notOfficial(version: string, running = runningImage(), arch = process.arch) {
  const image = officialImage(version);
  if (running !== image) {
    return `regressão visual só na imagem ${image} (job visual do CI); aqui: ${running ?? "fora dela"}`;
  }
  if (arch !== "x64")
    return `regressão visual só em linux/amd64, como o runner do CI; aqui: ${arch}`;
}
