import type { McpTransport } from "../../../../src/mcp/client.ts";
import { SSEError } from "../chat/sse-reader.ts";

// Bad Gateway e Gateway Timeout: de quem está no meio do caminho, não do gateway.
const PROXY_STATUS = new Set([502, 504]);

/** Falha do SSE típica de proxy (só ela troca para o WebSocket): resposta que não é event-stream
 * (página de bloqueio, corpo reescrito), 502/504 e tentativas esgotadas por um desses. 4xx, 5xx
 * do gateway, rede fora e cancelamento seguem como erro: o WebSocket cairia igual. */
export function isProxyFailure(error: unknown): boolean {
  if (!(error instanceof SSEError)) return false;
  if (error.code === "retries_exhausted") return isProxyFailure(error.cause);
  if (error.code === "http_status") return PROXY_STATUS.has(error.status ?? 0);
  return error.code === "bad_content_type";
}

/** Conecta pelo SSE e só passa ao WebSocket (fábrica: criado, ou baixado por `import()`, só aí) na
 * falha típica de proxy ou se o SSE não conectar em `stallMs` (proxy segurando o stream; ≤ 0 ou não
 * finito = sem prazo). Contract-first: o SSE do MCP ainda não existe no app — o `connect` dele
 * resolve no 1º evento, falha com o `SSEError` do PR 51 e o `disconnect` cancela o em curso. */
export async function connectMcp(
  sse: McpTransport,
  websocket: () => McpTransport | Promise<McpTransport>,
  urls: { sse: string; websocket: string },
  stallMs = 10_000,
): Promise<McpTransport> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const attempt = sse.connect(urls.sse); // o race assina: rejeição tardia não fica solta
  const stalled = new Promise<"stalled">((resolve) => {
    if (Number.isFinite(stallMs) && stallMs > 0) timer = setTimeout(resolve, stallMs, "stalled");
  });
  try {
    if ((await Promise.race([attempt, stalled])) !== "stalled") return sse;
  } catch (error) {
    if (!isProxyFailure(error)) throw error;
  } finally {
    clearTimeout(timer);
  }
  sse.disconnect().catch(() => undefined); // sem esperar: um disconnect preso não segura a troca
  const fallback = await websocket();
  await fallback.connect(urls.websocket);
  return fallback;
}
