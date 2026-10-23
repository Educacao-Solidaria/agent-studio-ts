import { expect, test } from "@playwright/test";
import { BACKEND_SERVICES } from "../../src/components/backend-services.ts";
import { INDEX_PATH } from "../../src/rag/index-document.ts";

// O ecossistema do compose do flow-gateway-go de pé com ESTE estúdio (job `stack` do CI). Pela
// origem do estúdio, como o painel e o upload pedem, cada link do proxy (contratos da Fase 5, §5)
// chega ao serviço certo pelo nome DNS do compose. Quem respondeu se reconhece pelo corpo: só o
// status não basta, porque o fallback do SPA também dá 200.

/** A saúde de cada lâmpada, no formato do serviço que a escreve (só ele tem aquele campo). */
const HEALTH: Record<string, Record<string, unknown>> = {
  // flow-gateway-go, internal/health: o uptime.
  "/health/gateway": { status: "ok", uptime_seconds: expect.any(Number) },
  // semantic-cache-rs, http.rs: o /health da API de depuração traz a versão do binário.
  "/health/cache": { status: "ok", version: expect.any(String) },
  // brain-router-py, app/health.py: o Postgres do compose atrás (a fábrica do `command`).
  "/health/rag": { status: "ok", checks: { postgres: "ok" } },
};

/** Sem healthcheck no gateway, o `up --wait` só o espera rodar: a 1ª resposta pode ser um 502. */
const eventually = (probe: () => Promise<void>) => expect(probe).toPass({ timeout: 20_000 });

test("toda lâmpada do painel tem a sua sonda, e toda sonda tem lâmpada", () => {
  expect(BACKEND_SERVICES.map(({ url }) => url).sort()).toEqual(Object.keys(HEALTH).sort());
});

for (const { name, url } of BACKEND_SERVICES) {
  test(`lâmpada ${name}: ${url} de pé`, async ({ request }) => {
    const body = HEALTH[url];
    if (!body) throw new Error(`${url}: lâmpada sem serviço conhecido nesta spec`);
    await eventually(async () => {
      const response = await request.get(url);
      expect(response.status(), await response.text()).toBe(200);
      expect(response.headers()["content-type"]).toContain("json");
      expect(await response.json()).toMatchObject(body);
    });
  });
}

test("/v1/ chega ao gateway: o 404 do roteador dele, com X-Request-Id", async ({ request }) => {
  // Rota que nunca vai existir no gateway: o 404 padrão do roteador (se ele ganhar um 404 próprio,
  // troque aqui). Do RAG viria o envelope JSON dele; do nginx, a página dele (502 sem o backend).
  await eventually(async () => {
    const response = await request.get("/v1/sonda-do-estudio");
    expect(response.status()).toBe(404);
    expect(await response.text()).toBe("404 page not found\n");
    expect(response.headers()["x-request-id"]).toBeTruthy();
  });
});

test("/api/ chega ao RAG: o upload leva o POST e o corpo à validação dele", async ({ request }) => {
  // `{}` para na validação, antes de indexar qualquer coisa. O RAG nomeia o campo que faltou no
  // corpo; sem corpo nenhum (perdido no proxy), a mensagem seria "corpo: Field required".
  await eventually(async () => {
    const response = await request.post(INDEX_PATH, { data: {} });
    expect(response.status()).toBe(422);
    const { error } = await response.json();
    expect(error.code).toBe("validation_error");
    expect(error.message).toContain("title");
  });
});

test("do cache só a saúde passa: o resto da API dele fica no SPA", async ({ request }) => {
  for (const path of ["/", "/stats", "/cache/entries", "/metrics", "/health/cache/stats"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()["content-type"], path).toContain("text/html");
    expect(await response.text(), path).toContain('<div id="root">');
  }
});
