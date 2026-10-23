import { describe, expect, it } from "vitest";
import ci from "../../../.github/workflows/ci.yml?raw";
import spec from "../e2e/stack/stack.spec.ts?raw";
import manifest from "../package.json?raw";
import defaults from "../playwright.config.ts?raw";
import config from "../playwright.stack.config.ts?raw";
import { field, get, keyOf, outline, pipeline, steps, texts, value } from "./test/workflow.ts";

// O job `stack` do CI (contratos da Fase 5, §1–§5): o compose do ecossistema, que mora no
// flow-gateway-go, sobe com o estúdio DESTE commit, e o e2e/stack sonda pela origem do estúdio.
// Que as sondas reprovam um link quebrado, só o próprio job prova (commit de mutação no PR 93).

const stack = get(get(outline(ci), "jobs"), "stack");
const { scripts } = JSON.parse(manifest);
/** §2: cada imagem é construída da raiz do seu repositório, com a tag local do contrato. */
const IMAGES = [
  ["flow-gateway-go", "educacao-solidaria/flow-gateway:dev", "gateway"],
  ["semantic-cache-rs", "educacao-solidaria/semantic-cache:dev", "cache"],
  ["brain-router-py", "educacao-solidaria/brain-router:dev", "rag"],
  ["agent-studio-ts", "educacao-solidaria/agent-studio:dev", "studio"],
];
const using = (action: string) =>
  steps(stack).filter((step) => field(step, "uses")?.startsWith(`${action}@`));

describe("job stack do CI", () => {
  it("os 4 repositórios lado a lado: este commit em agent-studio-ts e a main dos outros 3", () => {
    // Com `repository`/`ref` no 1º, o job subiria o estúdio da main e o PR passaria sem teste.
    expect(using("actions/checkout").map((step) => texts(get(step, "with")))).toEqual([
      ["path: agent-studio-ts", "persist-credentials: false"],
      ...IMAGES.slice(0, 3).map(([repo]) => [
        `repository: Educacao-Solidaria/${repo}`,
        `path: ${repo}`,
        "persist-credentials: false",
      ]),
    ]);
  });

  it("cada imagem só no Docker do runner, na tag que o compose espera; o cache se grava na main", () => {
    expect(using("docker/build-push-action").map((step) => texts(get(step, "with")))).toEqual(
      IMAGES.map(([repo, tag, scope]) => [
        `context: ${repo}`,
        `tags: ${tag}`,
        "load: true",
        "provenance: false",
        `cache-from: type=gha,scope=stack-${scope}`,
        `cache-to: \${{ github.ref == 'refs/heads/main' && 'type=gha,mode=max,scope=stack-${scope}' || '' }}`,
      ]),
    );
  });

  it("sobe o compose do flow-gateway-go com as imagens prontas e só então sonda", () => {
    expect(pipeline(stack)).toEqual([
      ...Array(4).fill("actions/checkout"),
      "sed 's/=$/=valor-falso-do-ci/' .env.example > .env",
      "docker/setup-buildx-action",
      ...Array(4).fill("docker/build-push-action"),
      "docker compose up -d --no-build --wait --wait-timeout 180",
      "pnpm/action-setup",
      "actions/setup-node",
      "pnpm install --frozen-lockfile",
      "pnpm test:e2e:stack",
      "docker compose ps -a && docker compose logs --no-color",
    ]);
    expect(steps(stack).map((step) => field(step, "if"))).toEqual([
      ...Array(15).fill(undefined),
      "failure()",
    ]);
    expect(value(get(get(stack, "defaults"), "run"), "working-directory")).toBe(
      "flow-gateway-go/deploy/compose",
    );
    const pnpm = steps(stack).filter((step) => field(step, "run")?.startsWith("pnpm "));
    expect(pnpm.map((step) => field(step, "working-directory"))).toEqual([
      "agent-studio-ts/apps/web",
      "agent-studio-ts/apps/web",
    ]);
  });

  it("nada que deixe passar ou que leve segredo: chaves e env em lista de permissão", () => {
    expect(texts(stack)?.map(keyOf).join()).toBe("runs-on,timeout-minutes,env,defaults,steps");
    expect(Number(value(stack, "timeout-minutes"))).toBeLessThanOrEqual(20);
    expect(texts(get(stack, "env"))).toEqual([
      "DOCKER_BUILD_RECORD_UPLOAD: false",
      "BUILDX_METADATA_PROVENANCE: disabled",
    ]);
    const allowed = ["name", "if", "uses", "with", "run", "working-directory"];
    for (const step of steps(stack)) {
      const keys = [step, ...step.kids].map(({ text }) => keyOf(text));
      for (const key of keys) expect(allowed, step.text).toContain(key);
    }
  });
});

describe("e2e/stack", () => {
  it("o script e a config: só esta pasta, sem servidor próprio, na origem publicada pelo compose", () => {
    expect(scripts["test:e2e:stack"]).toBe("playwright test --config playwright.stack.config.ts");
    expect([...config.matchAll(/^ {2}(\w+):/gm)].map(([, key]) => key)).toEqual([
      "testDir",
      "forbidOnly",
      "reporter",
      "use",
    ]);
    expect(config).toContain('testDir: "e2e/stack"');
    expect(config).toContain('baseURL: process.env.STUDIO_URL ?? "http://127.0.0.1:3000"');
    expect(defaults).toMatch(/testIgnore: \[[^\]]*"stack\/\*\*"/);
    // Teste pulado deixa o job verde sem sondar nada.
    expect(spec).not.toMatch(/\.(skip|fixme|only)\(/);
  });
});
