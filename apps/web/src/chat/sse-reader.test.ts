import { http } from "msw";
import { describe, expect, it, vi } from "vitest";
import type { SSEEvent } from "../../../../src/types/sse.ts";
import { server } from "../mocks/node.ts";
import { backoffDelay, createSSEParser, readSSE } from "./sse-reader.ts";

const STREAM_URL = "http://gateway.test/v1/stream";
const encoder = new TextEncoder();

const chunk = (text: string, id?: string) =>
  `${id ? `id: ${id}\n` : ""}event: chunk\ndata: {"id":"c1","model":"m","delta_content":${JSON.stringify(text)},"is_last":false}\n\n`;
const DONE = 'event: done\ndata: {"finish_reason":"stop","total_tokens":3,"duration_ms":9}\n\n';

/** Resposta SSE com os pedaços na ordem; `open` deixa a conexão aberta depois deles. */
function sse(parts: (string | Uint8Array)[], open = false) {
  const bytes = parts.map((part) => (typeof part === "string" ? encoder.encode(part) : part));
  const start = (controller: ReadableStreamDefaultController) => {
    for (const piece of bytes) controller.enqueue(piece);
    if (!open) controller.close();
  };
  const headers = { "Content-Type": "text/event-stream; charset=utf-8" };
  return () => new Response(new ReadableStream({ start }), { headers });
}
function reply(status: number, headers: HeadersInit = {}) {
  return () => new Response(null, { status, headers });
}

/** Gateway falso: o pedido n recebe a resposta n (a última se repete); os pedidos ficam guardados. */
function gateway(...replies: (() => Response)[]) {
  const requests: Request[] = [];
  server.use(
    http.all(STREAM_URL, ({ request }) => {
      requests.push(request);
      return replies[Math.min(requests.length, replies.length) - 1]?.();
    }),
  );
  return requests;
}

type Args = Parameters<typeof readSSE>;
async function collect(request: Args[0], options: Args[1] = {}, events: SSEEvent[] = []) {
  for await (const event of readSSE(request, { baseDelayMs: 1, ...options })) events.push(event);
  return events;
}

const text = (events: SSEEvent[]) =>
  events.map((event) => (event.event === "chunk" ? event.data.delta_content : "")).join("");

describe("createSSEParser", () => {
  it("junta data de várias linhas, tira só um espaço e ignora comentário e campo desconhecido", () => {
    const parser = createSSEParser();
    expect(parser.push(": ping\nfoo: bar\nevent: chunk\ndata:  a\ndata:b\ndata\n\n")).toEqual([
      { event: "chunk", data: " a\nb\n", id: "" },
    ]);
  });

  it("aceita CRLF, LF e CR, inclusive CR e LF em pedaços separados", () => {
    const parser = createSSEParser();
    const messages = [
      ...parser.push("data: a\r"),
      ...parser.push(""),
      ...parser.push("\ndata: b\r\n\r\ndata: c\r\rdata: d\n\n"),
    ];
    expect(messages.map((message) => message.data)).toEqual(["a\nb", "c", "d"]);
  });

  it("evento leva o id do bloco; o último id persiste no estado; id com NUL e retry ruim saem", () => {
    const parser = createSSEParser({ lastEventId: "0" });
    expect(parser.push("data: x\n\nid: 7\ndata: y\n\nid: 8\u0000\ndata:\n\n")).toEqual([
      { event: "", data: "x", id: "" },
      { event: "", data: "y", id: "7" },
      { event: "", data: "", id: "" },
    ]);
    expect(parser.state.lastEventId).toBe("7");
    expect(parser.push("retry: 1.5\nid: 9\n\n")).toEqual([]);
    expect(parser.state).toEqual({ lastEventId: "9", retryMs: undefined });
    expect(parser.push("retry: 3000\n\n")).toEqual([]);
    expect(parser.state).toEqual({ lastEventId: "9", retryMs: 3000 });
  });

  it("recusa linha, linha pendente ou data acumulado acima do teto", () => {
    const tooLarge = expect.objectContaining({ code: "event_too_large" });
    const parser = () => createSSEParser({ maxEventLength: 10 });
    expect(() => parser().push("event: 12345678901\n")).toThrow(tooLarge);
    expect(() => parser().push("data: 12345678901")).toThrow(tooLarge);
    expect(() => parser().push("data: 1234\ndata: 5678\ndata: 9\n")).toThrow(tooLarge);
    expect(parser().push("data: 1234\n\n")).toHaveLength(1);
  });
});

describe("readSSE", () => {
  it("lê os eventos do contrato por POST, com cabeçalhos, corpo e caractere multibyte partido", async () => {
    const bytes = encoder.encode(chunk("olá", "1"));
    const cut = bytes.indexOf(0xa1); // segundo byte do "á"
    const parts = [
      ": ping\n\n",
      bytes.slice(0, cut),
      bytes.slice(cut),
      "event: ping\ndata: {}\n\n",
    ];
    const requests = gateway(sse([...parts, DONE]));
    const headers = { Authorization: "Bearer t" };
    const events = await collect({ url: STREAM_URL, method: "POST", headers, body: '{"q":1}' });
    const first = { id: "c1", model: "m", delta_content: "olá", is_last: false };
    expect(events).toEqual([
      { event: "chunk", id: "1", data: first },
      { event: "done", data: { finish_reason: "stop", total_tokens: 3, duration_ms: 9 } },
    ]);
    const [request] = requests;
    expect(request?.method).toBe("POST");
    expect(request?.headers.get("authorization")).toBe("Bearer t");
    expect(request?.headers.get("accept")).toBe("text/event-stream");
    expect(request?.headers.get("last-event-id")).toBeNull();
    expect(await request?.text()).toBe('{"q":1}');
  });

  it("reconecta com Last-Event-ID depois da queda, sem repetir eventos", async () => {
    const requests = gateway(
      sse([chunk("a", "1"), chunk("b", "2")]),
      sse([chunk("c", "3")]),
      sse([DONE]),
    );
    const onRetry = vi.fn();
    // maxRetries 1 e duas quedas: só passa porque a conexão que entregou evento zera a contagem.
    expect(text(await collect({ url: STREAM_URL }, { maxRetries: 1, onRetry }))).toBe("abc");
    expect(requests.map((r) => r.headers.get("last-event-id"))).toEqual([null, "2", "3"]);
    const retries = onRetry.mock.calls.map(([retry]) => [retry.attempt, retry.lastEventId]);
    expect(retries).toEqual([
      [1, "2"],
      [1, "3"],
    ]);
  });

  it("usa o retry: do servidor como base e honra o Retry-After até o teto", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    gateway(
      sse(["retry: 40\n\n", chunk("a", "1")]),
      reply(503, { "Retry-After": "2" }),
      sse([DONE]),
    );
    const delays: number[] = [];
    const onRetry = ({ delayMs }: { delayMs: number }) => void delays.push(delayMs);
    await collect({ url: STREAM_URL }, { maxDelayMs: 60, onRetry });
    // 1ª espera: base 40 do servidor com o jitter mínimo. 2ª: Retry-After de 2 s, cortado no teto.
    expect(delays).toEqual([20, 60]);
  });

  it("desiste depois de maxRetries tentativas sem progresso; 0 = nenhuma", async () => {
    const requests = gateway(reply(503));
    const onRetry = vi.fn();
    await expect(collect({ url: STREAM_URL }, { maxRetries: 2, onRetry })).rejects.toMatchObject({
      code: "retries_exhausted",
      cause: { code: "http_status", status: 503 },
    });
    expect(requests).toHaveLength(3);
    expect(onRetry.mock.calls.map(([retry]) => retry.attempt)).toEqual([1, 2]);

    const once = gateway(reply(502));
    const exhausted = { code: "retries_exhausted" };
    await expect(collect({ url: STREAM_URL }, { maxRetries: 0 })).rejects.toMatchObject(exhausted);
    expect(once).toHaveLength(1);
  });

  it.each([
    ["status 401", reply(401), "http_status"],
    ["Content-Type errado", () => new Response("oi"), "bad_content_type"],
    ["payload fora do contrato", sse(['event: chunk\ndata: {"id":"c1"}\n\n']), "invalid_event"],
    ["data que não é JSON", sse(["event: done\ndata: [DONE]\n\n"]), "invalid_event"],
  ])("não reconecta em falha definitiva: %s", async (_, response, code) => {
    const requests = gateway(response);
    await expect(collect({ url: STREAM_URL })).rejects.toMatchObject({ name: "SSEError", code });
    expect(requests).toHaveLength(1);
  });

  it("queda depois de evento sem id vira interrupted em vez de repetir o pedido", async () => {
    const requests = gateway(sse([chunk("a")]));
    const events: SSEEvent[] = [];
    const interrupted = { code: "interrupted" };
    await expect(collect({ url: STREAM_URL }, {}, events)).rejects.toMatchObject(interrupted);
    expect(text(events)).toBe("a");
    expect(requests).toHaveLength(1);
  });

  it("done e break no for await fecham a conexão, mesmo com o servidor mantendo aberta", async () => {
    const requests = gateway(sse([chunk("a", "1"), DONE], true), sse([chunk("b", "2")], true));
    expect(text(await collect({ url: STREAM_URL }))).toBe("a");
    for await (const _event of readSSE({ url: STREAM_URL })) break;
    expect(requests.map((request) => request.signal.aborted)).toEqual([true, true]);
  });

  it("abortar no meio encerra sem erro e fecha a conexão; já abortado nem conecta", async () => {
    const requests = gateway(sse([chunk("a", "1")], true));
    const controller = new AbortController();
    const events: SSEEvent[] = [];
    for await (const event of readSSE({ url: STREAM_URL }, { signal: controller.signal })) {
      events.push(event);
      controller.abort();
    }
    expect(text(events)).toBe("a");
    expect(requests.map((request) => request.signal.aborted)).toEqual([true]);

    expect(await collect({ url: STREAM_URL }, { signal: controller.signal })).toEqual([]);
    expect(requests).toHaveLength(1);
  });

  it("abortar na espera da reconexão sai na hora, sem pedido novo", async () => {
    const requests = gateway(reply(503));
    const controller = new AbortController();
    // Sem acordar no abort, a espera de 15–30 s estouraria o tempo do teste.
    const onRetry = () => controller.abort();
    const options = { signal: controller.signal, baseDelayMs: 60_000, onRetry };
    await expect(collect({ url: STREAM_URL }, options)).resolves.toEqual([]);
    expect(requests).toHaveLength(1);
  });
});

describe("backoffDelay", () => {
  it("dobra até o teto, com jitter entre a metade e o teto; base 0 não vira NaN", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    const delays = [0, 1, 2, 3, 5000].map((attempt) => backoffDelay(attempt, 100, 500));
    expect(delays).toEqual([50, 100, 200, 250, 250]);
    expect(backoffDelay(5000, 0, 500)).toBe(0);
    random.mockReturnValue(0.999_999);
    expect(backoffDelay(3, 100, 500)).toBeCloseTo(500, 2);
  });
});
