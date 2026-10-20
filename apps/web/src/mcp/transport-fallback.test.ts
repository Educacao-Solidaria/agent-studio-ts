import { afterEach, describe, expect, it, vi } from "vitest";
import { SSEError } from "../chat/sse-reader.ts";
import { connectMcp, isProxyFailure } from "./transport-fallback.ts";

const urls = { sse: "https://gateway.test/mcp/sse", websocket: "wss://gateway.test/mcp/ws" };
const fake = (connect: () => Promise<void> = async () => {}) => ({
  connect: vi.fn(connect),
  disconnect: vi.fn(async () => {}),
  send: vi.fn(async () => {}),
  onMessage: vi.fn(),
  onError: vi.fn(),
});
const status = (code: number) => new SSEError("http_status", `respondeu ${code}`, { status: code });
const exhausted = (cause: unknown) => new SSEError("retries_exhausted", "esgotou", { cause });
afterEach(() => vi.useRealTimers());

type Case = [string, unknown, boolean];
it.each<Case>([
  ["resposta que não é event-stream", new SSEError("bad_content_type", "html"), true],
  ["502 de intermediário", status(502), true],
  ["504 de intermediário", status(504), true],
  ["tentativas esgotadas por 504", exhausted(status(504)), true],
  ...[401, 403, 404, 429, 500, 503].map((code): Case => [`${code}`, status(code), false]),
  ["rede fora do ar", exhausted(new TypeError("Failed to fetch")), false],
  ["evento fora do contrato", new SSEError("invalid_event", "x"), false],
  ["evento grande demais", new SSEError("event_too_large", "x"), false],
  ["cancelado", new DOMException("parou", "AbortError"), false],
  ["erro qualquer", new Error("x"), false],
  ["nada", undefined, false],
])("isProxyFailure: %s → %s", (_, error, expected) => expect(isProxyFailure(error)).toBe(expected));

describe("connectMcp", () => {
  it("o SSE conectou: fica nele; outra falha sobe como veio; nos dois o WebSocket nem tenta", async () => {
    const [sse, websocket] = [fake(), fake()];
    expect(await connectMcp(sse, () => websocket, urls)).toBe(sse);
    expect(sse.connect).toHaveBeenCalledWith(urls.sse);
    const [denied, refusing] = [status(401), fake(() => Promise.reject(status(401)))];
    await expect(connectMcp(refusing, () => websocket, urls)).rejects.toEqual(denied);
    expect(websocket.connect).not.toHaveBeenCalled();
  });

  it("falha típica de proxy: larga o SSE e conecta o WebSocket na URL dele", async () => {
    const [sse, websocket] = [fake(() => Promise.reject(status(502))), fake()];
    expect(await connectMcp(sse, () => websocket, urls)).toBe(websocket);
    expect(sse.disconnect).toHaveBeenCalled();
    expect(websocket.connect).toHaveBeenCalledWith(urls.websocket);
  });

  it("SSE que não conecta no prazo (proxy segurando o stream) troca para o WebSocket", async () => {
    vi.useFakeTimers();
    let fail = (_: Error) => {};
    const [sse, websocket] = [fake(() => new Promise((_, reject) => (fail = reject))), fake()];
    const chosen = connectMcp(sse, () => websocket, urls, 5_000);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(websocket.connect).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await chosen).toBe(websocket);
    expect(sse.disconnect).toHaveBeenCalled();
    fail(new Error("tarde demais")); // a rejeição tardia do SSE não fica solta
  });

  it("prazo 0, negativo, NaN ou infinito = sem prazo; conectou antes do prazo = timer some", async () => {
    vi.useFakeTimers();
    for (const stallMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 120_000]) {
      const sse = fake(() => new Promise((resolve) => setTimeout(resolve, 60_000)));
      const chosen = connectMcp(sse, fake, urls, stallMs);
      await vi.advanceTimersByTimeAsync(60_000);
      expect([await chosen, vi.getTimerCount()]).toEqual([sse, 0]);
    }
  });
});
