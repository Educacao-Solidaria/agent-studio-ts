import { describe, expect, it } from "vitest";
import dockerfile from "../../../Dockerfile?raw";
import nginxConf from "../docker/nginx.conf?raw";
import { OPENROUTER_MODELS_URL } from "./chat/model-pricing.ts";
import { MAX_BODY_BYTES } from "./rag/index-document.ts";

// Contratos da Fase 5 (§2 imagem, §5 mesma origem) conferidos no texto do Dockerfile e da config
// do nginx. O que só o container prova (sobe sem backend, uid, cabeçalhos, o mapa do proxy contra
// um backend falso) fica no smoke do job `image` do CI: docker/smoke.sh.

type Directive = { name: string; args: string[]; block?: Directive[] };

/** Parser mínimo da sintaxe do nginx: `nome args;` e `nome args { ... }`, aspas e comentários. */
function parseNginx(text: string): Directive[] {
  const tokens = text.replace(/#.*/g, "").match(/"[^"]*"|[{};]|[^\s{};"]+/g) ?? [];
  let at = 0;
  const level = (): Directive[] => {
    const out: Directive[] = [];
    let words: string[] = [];
    while (at < tokens.length) {
      const token = tokens[at++] ?? "";
      if (token === "}") return out;
      if (token !== ";" && token !== "{") {
        words.push(token.replace(/^"(.*)"$/, "$1"));
        continue;
      }
      const [name = "", ...args] = words;
      out.push(token === "{" ? { name, args, block: level() } : { name, args });
      words = [];
    }
    return out;
  };
  return level();
}

const servers = parseNginx(nginxConf).filter((d) => d.name === "server");
const server = servers[0]?.block ?? [];
const all = (name: string, block: Directive[] = server) => block.filter((d) => d.name === name);
const arg = (block: Directive[] | undefined, name: string) =>
  block?.find((d) => d.name === name)?.args;
const locations = all("location");
const vars = new Map(all("set").map(({ args: [name = "", value = ""] }) => [name, value]));
const listen = arg(server, "listen")?.[0];
const root = arg(server, "root")?.[0];

/** A location que o nginx escolhe para um caminho já normalizado: `=` exato, senão o maior prefixo. */
function locate(path: string) {
  const exact = locations.find(({ args }) => args[0] === "=" && args[1] === path);
  const prefixOf = ({ args }: Directive) => (args.length === 1 ? `${args[0]}` : "\0");
  const matching = locations.filter((d) => path.startsWith(prefixOf(d)));
  return exact ?? matching.sort((a, b) => prefixOf(b).length - prefixOf(a).length)[0];
}

/** Para onde o pedido vai: a URL no backend, ou undefined quando o nginx serve do disco. */
function upstreamOf(path: string) {
  const target = arg(locate(path)?.block, "proxy_pass")?.[0];
  if (!target) return undefined;
  const url = target.replace(/\$\w+/g, (name) => vars.get(name) ?? name);
  // proxy_pass com variável e sem caminho repassa o URI do pedido; com caminho, troca por ele.
  return /^https?:\/\/[^/]+$/.test(url) ? url + path : url;
}

/** `client_max_body_size` em bytes (`2m`, `512k`, `100`). */
function bytes(size = "") {
  const [, n = "NaN", unit = ""] = /^(\d+)([km]?)$/i.exec(size) ?? [];
  return Number(n) * ({ k: 1024, m: 1024 ** 2 }[unit.toLowerCase()] ?? 1);
}

describe("nginx do estúdio (contrato §5)", () => {
  it("um server só, na 3000, com locations de prefixo ou exatas (o modelo do locate)", () => {
    expect(servers).toHaveLength(1);
    expect(all("listen")).toEqual([{ name: "listen", args: ["3000"] }]);
    expect(locations.every(({ args }) => args.length === 1 || args[0] === "=")).toBe(true);
  });

  it.each([
    ["/api/v1/index", "http://rag:8000/api/v1/index"],
    ["/api/v1/search/stream", "http://rag:8000/api/v1/search/stream"],
    ["/v1/chat/completions", "http://gateway:8080/v1/chat/completions"],
    ["/health/gateway", "http://gateway:8080/healthz"],
    ["/health/rag", "http://rag:8000/healthz"],
    ["/health/cache", "http://cache:8099/health"],
  ])("%s → %s", (path, url) => {
    expect(upstreamOf(path)).toBe(url);
  });

  it.each([
    "/",
    "/fluxos/1",
    "/index.html",
    "/health",
    "/health/cache/stats",
    "/cache/entries",
    "/stats",
    "/metrics",
    "/healthz",
    "/v1",
    "/apis",
  ])("%s fica no SPA, sem proxy", (path) => {
    expect(upstreamOf(path)).toBeUndefined();
    expect(arg(locate(path)?.block, "try_files")).toEqual(["$uri", "/index.html"]);
  });

  it("backend resolvido a cada pedido pelo DNS do Docker: a imagem sobe sem ele", () => {
    expect(arg(server, "resolver")?.[0]).toBe("127.0.0.11");
    const passes = locations.flatMap(({ block }) => all("proxy_pass", block));
    expect(passes).toHaveLength(5);
    // Host fixo no proxy_pass é resolvido na partida: sem o backend, o nginx nem sobe.
    for (const { args } of passes) expect(args[0]).toMatch(/^\$\w+/);
  });

  it("SSE sem buffer e sem o corte de 60 s, e o upload passa até o teto do RAG", () => {
    expect(arg(locate("/v1/x")?.block, "proxy_buffering")).toEqual(["off"]);
    expect(arg(locate("/v1/x")?.block, "proxy_read_timeout")).toEqual(["300s"]);
    expect(arg(locate("/api/x")?.block, "proxy_buffering")).toEqual(["off"]);
    const limit = bytes(arg(locate("/api/x")?.block, "client_max_body_size")?.[0]);
    expect(limit).toBeGreaterThanOrEqual(MAX_BODY_BYTES);
  });

  it("cache longo só nos assets com hash, que nunca caem no index.html", () => {
    const assets = locate("/assets/index-B0Ozq5i8.js")?.block;
    expect(arg(assets, "try_files")).toEqual(["$uri", "=404"]);
    expect(arg(assets, "add_header")).toEqual([
      "Cache-Control",
      "public, max-age=31536000, immutable",
    ]);
    expect(arg(locate("/")?.block, "add_header")).toEqual(["Cache-Control", "no-cache"]);
  });
});

/** Os `add_header` do server: nome → [valor, flag]. */
const headers = new Map(all("add_header").map(({ args: [name = "", ...rest] }) => [name, rest]));
/** As diretivas da CSP, na ordem: [nome, fontes]. */
const directives = (headers.get("Content-Security-Policy")?.[0] ?? "")
  .split(";")
  .map((directive) => directive.trim().split(/\s+/))
  .map(([name = "", ...sources]) => [name, sources] as const);
const csp = new Map(directives);

describe("cabeçalhos de segurança (CSP, HSTS)", () => {
  it("em toda resposta: `always` no server e o `merge` que os soma ao add_header das locations", () => {
    // Lista, não mapa: nome repetido manda o cabeçalho duas vezes (do HSTS, o navegador usa o 1º).
    expect(all("add_header").map(({ args }) => args[0])).toEqual([
      "Content-Security-Policy",
      "Strict-Transport-Security",
      "X-Content-Type-Options",
      "Referrer-Policy",
      "Cross-Origin-Opener-Policy",
      "Permissions-Policy",
    ]);
    for (const [name, [, flag]] of headers) expect(flag, name).toBe("always");
    expect(arg(server, "add_header_inherit")).toEqual(["merge"]);
    // Uma location com `add_header_inherit` próprio derrubaria nela os cabeçalhos do server.
    expect(locations.filter(({ block }) => arg(block, "add_header_inherit"))).toEqual([]);
  });

  it("CSP: só a própria origem, sem eval nem script inline; de fora, só os preços da OpenRouter", () => {
    // Diretiva repetida: o navegador usa a 1ª, e o mapa guardaria a última.
    expect(csp.size).toBe(directives.length);
    expect(csp.get("default-src")).toEqual(["'none'"]);
    expect(csp.get("script-src")).toEqual(["'self'"]);
    expect(csp.get("connect-src")).toEqual(["'self'", OPENROUTER_MODELS_URL]);
    // Estas não herdam do default-src: sem elas, nada as limita.
    for (const name of ["base-uri", "form-action", "frame-ancestors"]) {
      expect(csp.get(name), name).toEqual(["'none'"]);
    }
    // Toda outra fonte (host, data:, blob:, curinga, 'unsafe-eval') pede medida e decisão novas.
    const allowed: Record<string, string[]> = {
      "style-src": ["'unsafe-inline'"],
      "connect-src": [OPENROUTER_MODELS_URL],
    };
    for (const [name, sources] of directives) {
      const known = ["'self'", "'none'", ...(allowed[name] ?? [])];
      expect(
        sources.filter((source) => !known.includes(source)),
        name,
      ).toEqual([]);
    }
  });

  it("HSTS de um ano ou mais", () => {
    const [hsts = ""] = headers.get("Strict-Transport-Security") ?? [];
    expect(Number(/^max-age=(\d+)$/.exec(hsts)?.[1])).toBeGreaterThanOrEqual(31_536_000);
  });

  it("nosniff, referrer, COOP e permissões no valor exato: trocar pede decisão nova", () => {
    const value = (name: string) => headers.get(name)?.[0];
    expect(value("X-Content-Type-Options")).toBe("nosniff");
    expect(value("Referrer-Policy")).toBe("no-referrer");
    expect(value("Cross-Origin-Opener-Policy")).toBe("same-origin");
    expect(value("Permissions-Policy")).toBe("camera=(), microphone=(), geolocation=()");
  });
});

/** Instruções do Dockerfile, uma por linha: continuação juntada, sem comentário nem linha vazia. */
const instructions = dockerfile
  .replace(/\\\n\s*/g, " ")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"));
const stages = instructions.reduce<string[][]>((acc, line) => {
  if (line.startsWith("FROM ")) acc.push([]);
  acc.at(-1)?.push(line);
  return acc;
}, []);
const final = stages.at(-1) ?? [];
/** Os argumentos de cada instrução `keyword` da etapa. */
const of = (stage: string[], keyword: string) =>
  stage.flatMap((line) => line.match(new RegExp(`^${keyword} (.*)`))?.slice(1) ?? []);

describe("Dockerfile (contrato §2)", () => {
  it("multi-stage, com toda base fixada por digest e a tag ao lado", () => {
    expect(stages.length).toBeGreaterThanOrEqual(2);
    for (const [from] of stages) {
      expect(from).toMatch(/^FROM [\w./-]+:[\w.-]+@sha256:[0-9a-f]{64}( AS \w+)?$/);
    }
  });

  it("a final é o nginx sem root, com o uid 101 e a porta do server", () => {
    expect(final[0]).toMatch(/^FROM nginxinc\/nginx-unprivileged:/);
    expect(of(final, "USER")).toEqual(["101"]);
    expect(of(final, "EXPOSE")).toEqual([listen]);
    expect(of(final, "HEALTHCHECK").join()).toContain(`"http://127.0.0.1:${listen}/"`);
  });

  it("a final leva só esta config e o build, na raiz que o nginx serve", () => {
    expect(of(final, "COPY")).toEqual([
      "apps/web/docker/nginx.conf /etc/nginx/conf.d/default.conf",
      `--from=build /repo/apps/web/dist ${root}`,
    ]);
  });

  it("nenhum segredo em ARG/ENV, nenhum .env copiado", () => {
    const secret = /^(ARG|ENV) .*(KEY|TOKEN|SECRET|PASS)/i;
    expect(instructions.filter((line) => secret.test(line))).toEqual([]);
    expect(instructions.filter((line) => /^(COPY|ADD) .*\.env/.test(line))).toEqual([]);
  });
});
