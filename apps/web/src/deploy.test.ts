import { describe, expect, it } from "vitest";
import workflow from "../../../.github/workflows/deploy.yml?raw";

// Contrato da Fase 5, §6 (deploy do studio): o workflow do staging conferido no texto. O build no
// subcaminho do Pages é provado pelo smoke e2e/pages, no próprio workflow; o deploy pulado sem a
// variável, só pelo GitHub (o check `deploy` sai como "skipped").

type Line = { text: string; kids: Line[] };

/** O YAML como árvore de indentação: cada linha é filha da última linha menos indentada acima
 * dela, sem comentários. Basta para o subconjunto do workflow: mapas em bloco, listas com `- ` e
 * escalar numa linha (sem ` #` dentro de aspas). */
function outline(yaml: string) {
  const root: Line = { text: "", kids: [] };
  const open = [{ indent: -1, line: root }];
  for (const raw of yaml.split("\n")) {
    const text = raw.replace(/\s+#.*$/, "").trim();
    if (text === "" || text.startsWith("#")) continue;
    const indent = raw.length - raw.trimStart().length;
    while ((open.at(-1)?.indent ?? -1) >= indent) open.pop();
    const line: Line = { text, kids: [] };
    open.at(-1)?.line.kids.push(line);
    open.push({ indent, line });
  }
  return root;
}

const keyOf = (text: string) => /^(?:- )?([\w-]+):(?: |$)/.exec(text)?.[1];
const scalarOf = (text: string) => text.replace(/^(?:- )?[\w-]+:\s*/, "");
const texts = (line?: Line) => line?.kids.map(({ text }) => text);

/** O filho `chave:`. Chave repetida o GitHub recusa, e este teste também. */
function get(line: Line | undefined, key: string) {
  const found = line?.kids.filter(({ text }) => keyOf(text) === key) ?? [];
  expect(found.length, `chave repetida: ${key}`).toBeLessThan(2);
  return found[0];
}
const value = (line: Line | undefined, key: string) => {
  const found = get(line, key);
  return found && scalarOf(found.text);
};

const doc = outline(workflow);
const jobs = get(doc, "jobs");
const build = get(jobs, "build");
const deploy = get(jobs, "deploy");
const steps = (job?: Line) => get(job, "steps")?.kids ?? [];
/** Campo de um passo: a 1ª chave está na própria linha do `- `, as outras são filhas dela. */
const field = (step: Line, key: string) =>
  keyOf(step.text) === key ? scalarOf(step.text) : value(step, key);
/** Cada passo pelo que faz: a action sem a versão, ou o comando. */
const pipeline = (job?: Line) =>
  steps(job).map((step) => field(step, "uses")?.replace(/@.*/, "") ?? field(step, "run"));

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

  it("todo job com prazo, action por major ou sha (nunca um ramo) e nenhuma expressão em run", () => {
    for (const job of jobs?.kids ?? []) {
      expect(Number(value(job, "timeout-minutes")), job.text).toBeGreaterThan(0);
      expect(Number(value(job, "timeout-minutes")), job.text).toBeLessThanOrEqual(20);
    }
    const all = [build, deploy].flatMap(steps);
    for (const uses of all.flatMap((step) => field(step, "uses") ?? [])) {
      expect(uses).toMatch(/^[\w-]+\/[\w-]+@(v\d+|[0-9a-f]{40})$/);
    }
    for (const run of all.flatMap((step) => field(step, "run") ?? [])) {
      expect(run).not.toMatch(/\$\{\{|^[|>]/);
    }
  });
});
