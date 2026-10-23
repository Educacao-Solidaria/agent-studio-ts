import { describe, expect, it } from "vitest";
import workflow from "../../../.github/workflows/deploy.yml?raw";
import { field, get, keyOf, outline, pipeline, steps, texts, value } from "./test/workflow.ts";

// Contrato da Fase 5, §6 (deploy do studio): o workflow do staging conferido no texto. O build no
// subcaminho do Pages é provado pelo smoke e2e/pages, no próprio workflow; o deploy pulado sem a
// variável, só pelo GitHub (o check `deploy` sai como "skipped").

const doc = outline(workflow);
const jobs = get(doc, "jobs");
const build = get(jobs, "build");
const deploy = get(jobs, "deploy");

describe("workflow do staging no GitHub Pages (contrato §6)", () => {
  it("dispara no merge da main, no PR e à mão; nunca em pull_request_target nem em tag", () => {
    expect(texts(get(doc, "on"))).toEqual(["push:", "pull_request:", "workflow_dispatch:"]);
    expect(texts(get(get(doc, "on"), "push"))).toEqual(["branches: [main]"]);
  });

  it("o token só lê; escrever no Pages, só o job de deploy", () => {
    expect(texts(get(doc, "permissions"))).toEqual(["contents: read"]);
    expect(texts(jobs)).toEqual(["build:", "deploy:"]);
    expect(get(build, "permissions")).toBeUndefined();
    expect(texts(get(deploy, "permissions"))).toEqual(["pages: write", "id-token: write"]);
  });

  it("deploy só na main e com STAGING_PAGES = true, depois do build, e só o deploy-pages", () => {
    expect(value(deploy, "if")).toBe(
      "github.ref == 'refs/heads/main' && vars.STAGING_PAGES == 'true'",
    );
    expect(value(deploy, "needs")).toBe("build");
    expect(value(get(deploy, "environment"), "name")).toBe("github-pages");
    expect(pipeline(deploy)).toEqual(["actions/deploy-pages"]);
  });

  it("build com o base do Pages só aqui, smoke antes do artefato, e o artefato é só o dist", () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: é a expressão do Actions, não template do JS
    expect(value(get(build, "env"), "PAGES_BASE")).toBe("/${{ github.event.repository.name }}/");
    expect(pipeline(build)).toEqual([
      "actions/checkout",
      "pnpm/action-setup",
      "actions/setup-node",
      "pnpm install --frozen-lockfile",
      'pnpm build --base "$PAGES_BASE"',
      "pnpm exec playwright install --with-deps chromium",
      "pnpm test:e2e:pages",
      "actions/upload-pages-artifact",
    ]);
    expect(value(get(steps(build)[0], "with"), "persist-credentials")).toBe("false");
    expect(value(get(steps(build).at(-1), "with"), "path")).toBe("apps/web/dist");
  });

  it("smoke vermelho barra o artefato: no build, nada de if, continue-on-error, env de passo nem ambiente", () => {
    // Lista de permissão: chave nova no job ou num passo do build é decisão consciente, com teste novo.
    expect(texts(build)?.map(keyOf).join()).toBe("runs-on,timeout-minutes,defaults,env,steps");
    for (const step of steps(build)) {
      for (const { text } of [step, ...step.kids]) {
        expect(["name", "id", "uses", "with", "run"], step.text).toContain(keyOf(text));
      }
    }
  });

  it("todo job com prazo, action oficial por major ou sha, de terceiro só por sha, nenhuma expressão em run", () => {
    for (const job of jobs?.kids ?? []) {
      expect(Number(value(job, "timeout-minutes")), job.text).toBeGreaterThan(0);
      expect(Number(value(job, "timeout-minutes")), job.text).toBeLessThanOrEqual(20);
    }
    const all = [build, deploy].flatMap(steps);
    for (const uses of all.flatMap((step) => field(step, "uses") ?? [])) {
      // A tag é mutável: no workflow que publica, código de terceiro só pelo sha que o CI rodou.
      expect(uses).toMatch(/^(actions\/[\w-]+@v\d+|[\w-]+\/[\w-]+@[0-9a-f]{40})$/);
    }
    for (const run of all.flatMap((step) => field(step, "run") ?? [])) {
      expect(run).not.toMatch(/\$\{\{|^[|>]/);
    }
  });
});
