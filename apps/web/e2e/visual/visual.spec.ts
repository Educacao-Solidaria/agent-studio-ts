import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { openCatalog, settle, showStory, type Theme } from "../catalog.ts";

// Regressão visual: as telas do Studio e cada story do catálogo, no tema do projeto (claro ou
// escuro), contra os PNG de __snapshots__. PNG novo ou mudado reprova o job `visual` do CI, que
// gera os candidatos na mesma imagem e os sobe no artefato visual-snapshots: revise e commite.

// Story que nunca para de mudar não tem foto estável: fica de fora, com o motivo.
const MOVING: Record<string, string> = {
  "canvas/studio-canvas.stories.tsx › LiveExecution":
    "execução em laço; SampleFlow é o mesmo canvas",
  "chat/auto-scroll.stories.tsx › Streaming": "uma palavra a cada 60 ms por 36 s",
  "chat/virtual-messages.stories.tsx › Streaming": "texto chegando por timer, sem fim",
  "chat/ttft.stories.tsx › Waiting": "cronômetro a cada quadro; Measured e Stopped cobrem o layout",
  "telemetry/perf-charts.stories.tsx › Live": "amostra nova a cada 1,5 s",
};
// O rastro do erro muda com o código (URL, linha e coluna): a caixa entra na foto, o texto não.
const MASK: Record<string, string> = {
  "components/error-boundary.stories.tsx › WithDetails": "pre",
};

const opens = async (page: Page, button: string) => {
  await page.getByRole("button", { name: button }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
};
/** As telas do Studio, na ordem: cada passo leva a tela ao estado da foto que tem o nome dele. */
const STUDIO: Record<string, (page: Page) => Promise<unknown>> = {
  studio: async (page) => {
    await page.goto("/");
    await expect(page.locator(".react-flow__node").first()).toBeVisible({ timeout: 30_000 });
  },
  "studio-atalhos": (page) => page.getByRole("button", { name: "Atalhos do teclado" }).click(),
  "studio-painel": async (page) => {
    await page.locator(".react-flow__node").first().click();
    await expect(page.getByRole("complementary")).toBeVisible();
  },
  "studio-paleta": (page) => opens(page, "Adicionar nó"),
  "studio-modelos": async (page) => {
    await page.keyboard.press("Escape");
    await opens(page, "Modelos");
  },
};

/** `chat/code-block.stories.tsx › Highlighted` → `chat-code-block--highlighted`. */
const shotOf = (id: string) =>
  id
    .replace(".stories.tsx › ", "--")
    .replaceAll("/", "-")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase();

const themeOf = () => test.info().project.name as Theme;

test("as telas do Studio: canvas, atalhos, painel, paleta e modelos", async ({ page }) => {
  for (const [name, step] of Object.entries(STUDIO)) {
    await step(page);
    await expect(page.locator("html")).toHaveCSS("color-scheme", themeOf());
    await settle(page);
    await expect.soft(page, name).toHaveScreenshot(`${name}.png`);
  }
});

test("toda story do catálogo que para de mudar", async ({ page }, info) => {
  test.setTimeout(300_000);
  const ids = await openCatalog(page, themeOf(), [...Object.keys(MOVING), ...Object.keys(MASK)]);
  const still = ids.filter((id) => !MOVING[id]);
  for (const id of still) {
    await showStory(page, id, themeOf());
    await settle(page);
    const masked = MASK[id];
    const mask = masked ? [page.locator(masked)] : [];
    await expect.soft(page, id).toHaveScreenshot(`${shotOf(id)}.png`, { mask });
  }
  // PNG que nenhuma foto produz (story renomeada ou removida) é referência morta: apague-o.
  const wanted = [...Object.keys(STUDIO), ...still.map(shotOf)].map((name) =>
    info.snapshotPath(`${name}.png`, { kind: "screenshot" }),
  );
  const dir = dirname(wanted[0] ?? ".");
  const onDisk = readdirSync(dir)
    .filter((file) => file.endsWith(`-${info.project.name}.png`))
    .map((file) => join(dir, file));
  expect(onDisk.sort()).toEqual(wanted.sort());
});
