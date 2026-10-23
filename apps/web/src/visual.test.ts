import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import ci from "../../../.github/workflows/ci.yml?raw";
import { BASELINE_DIR, notOfficial, officialImage, runningImage } from "../e2e/visual/baseline.ts";
import manifest from "../package.json?raw";
import { field, get, keyOf, outline, pipeline, steps, texts, value } from "./test/workflow.ts";

// Regressão visual (e2e/visual): o job `visual` do CI e a trava do playwright.visual.config. Os PNG
// só nascem e só são comparados na imagem oficial do Playwright da versão exata do pacote. Que a
// foto reprova layout e tema quebrados, só o próprio job prova (commit de mutação no PR 99).

const visual = get(get(outline(ci), "jobs"), "visual");
const version: string = JSON.parse(manifest).devDependencies["@playwright/test"];

describe("job visual do CI", () => {
  it("roda na imagem oficial do Playwright da versão exata do @playwright/test, por digest", () => {
    // Faixa (^1.60.0) deixaria o pacote andar sem a imagem, e o navegador da foto mudaria calado.
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    const [image, digest] = value(get(visual, "container"), "image")?.split("@") ?? [];
    expect(image).toBe(officialImage(version));
    expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("compara primeiro; candidatos e artefato só depois de uma falha, na mesma imagem", () => {
    expect(pipeline(visual)).toEqual([
      "actions/checkout",
      "pnpm/action-setup",
      "actions/setup-node",
      "pnpm install --frozen-lockfile",
      "pnpm test:visual",
      "pnpm test:visual --update-snapshots=changed --output=/tmp/visual-candidatos",
      "actions/upload-artifact",
    ]);
    const conditions = steps(visual).map((step) => field(step, "if"));
    expect(conditions).toEqual([...Array(5).fill(undefined), "failure()", "failure()"]);
    const upload = get(steps(visual).at(-1), "with");
    expect(texts(get(upload, "path"))).toContain(`apps/web/${BASELINE_DIR}`);
  });

  it("nada que deixe passar: chaves do job, do container e dos passos em lista de permissão", () => {
    expect(texts(visual)?.map(keyOf).join()).toBe(
      "runs-on,timeout-minutes,container,defaults,steps",
    );
    expect(texts(get(visual, "container"))?.map(keyOf)).toEqual(["image"]);
    expect(Number(value(visual, "timeout-minutes"))).toBeLessThanOrEqual(20);
    for (const step of steps(visual)) {
      for (const { text } of [step, ...step.kids]) {
        expect(["name", "if", "uses", "with", "run"], step.text).toContain(keyOf(text));
      }
    }
  });
});

describe("trava do ambiente dos PNG (playwright.visual.config)", () => {
  const image = officialImage("1.60.0");

  it("só na imagem oficial da versão do pacote e em linux/amd64, como o runner do CI", () => {
    expect(image).toBe("mcr.microsoft.com/playwright:v1.60.0-noble");
    expect(notOfficial("1.60.0", image, "x64")).toBeUndefined();
    expect(notOfficial("1.61.0", image, "x64")).toContain(
      "imagem mcr.microsoft.com/playwright:v1.61.0",
    );
    expect(notOfficial("1.60.0", undefined, "x64")).toContain("aqui: fora dela");
    expect(notOfficial("1.60.0", image, "arm64")).toContain("aqui: arm64");
  });

  it("lê a imagem do .docker-info que a oficial grava; sem ele, ilegível ou sem o nome, nenhuma", () => {
    const dir = mkdtempSync(join(tmpdir(), "visual-"));
    const file = join(dir, ".docker-info");
    expect(runningImage(file)).toBeUndefined();
    writeFileSync(file, "{");
    expect(runningImage(file)).toBeUndefined();
    writeFileSync(file, JSON.stringify({ driverVersion: "1.60.0" }));
    expect(runningImage(file)).toBeUndefined();
    writeFileSync(file, JSON.stringify({ driverVersion: "1.60.0", dockerImageName: image }));
    expect(runningImage(file)).toBe(image);
    rmSync(dir, { recursive: true });
  });

  // O processo de verdade (o vitest roda em apps/web): `playwright test` lê a config e para nela.
  it.skipIf(runningImage())(
    "fora da imagem, como no job web, a config recusa",
    { timeout: 30_000 },
    () => {
      const args = ["test", "--config", "playwright.visual.config.ts", "--list"];
      const run = spawnSync("node_modules/.bin/playwright", args, { encoding: "utf8" });
      expect(run.status).toBe(1);
      expect(run.stderr + run.stdout).toContain(
        `regressão visual só na imagem ${officialImage(version)} (job visual do CI); aqui: fora dela`,
      );
    },
  );
});
