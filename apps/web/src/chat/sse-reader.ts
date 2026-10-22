import type { SSEEvent } from "../../../../src/types/sse.ts";
import { retryImport } from "../lib/retry-import.ts";

/**
 * Pedido que abre o stream. O corpo é texto, não stream: a reconexão manda o mesmo corpo de novo.
 * `fetch` em vez de EventSource porque o EventSource não aceita POST nem cabeçalho.
 */
export type SSERequest = { url: string; headers?: Record<string, string> } & (
  | { method?: "GET"; body?: undefined }
  | { method: "POST"; body?: string }
);

/** `attempt` é 1 na primeira reconexão seguida e zera quando uma conexão entrega evento. */
export type SSERetry = { attempt: number; delayMs: number; lastEventId: string; cause: unknown };

export interface SSEOptions {
  signal?: AbortSignal;
  maxRetries?: number; // reconexões seguidas sem receber evento antes de desistir; 0 = nenhuma
  baseDelayMs?: number; // base do backoff exponencial; o campo `retry:` do servidor a substitui
  maxDelayMs?: number;
  maxEventLength?: number; // teto, em caracteres, de uma linha e do `data` acumulado de um evento
  onRetry?: (retry: SSERetry) => void;
}

export type SSEErrorCode =
  | "http_status"
  | "bad_content_type"
  | "event_too_large"
  | "invalid_event"
  | "interrupted"
  | "retries_exhausted";

/** Falha definitiva do stream. A mensagem nunca carrega o payload (pode ser dado do usuário). */
export class SSEError extends Error {
  readonly status?: number;
  constructor(
    readonly code: SSEErrorCode,
    message: string,
    options: { status?: number; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "SSEError";
    this.status = options.status;
  }
}

/** Mensagem crua, antes de validar o payload. `event`/`id` "" = bloco sem `event:`/`id:`. */
export type SSEMessage = { event: string; data: string; id: string };

/**
 * Parser incremental do `text/event-stream` (WHATWG HTML): linha termina em CRLF, LF ou CR, mesmo
 * com CR e LF em pedaços separados; `data:` de várias linhas se junta com "\n"; comentário e campo
 * desconhecido são ignorados. Um parser por conexão (evento sem a linha em branco final morre com
 * ela); `state` leva o último id e o `retry:` para a reconexão.
 */
export function createSSEParser({ lastEventId = "", maxEventLength = 1 << 20 } = {}) {
  const state = { lastEventId, retryMs: undefined as number | undefined };
  let pending = "";
  let skipLF = false;
  let event = "";
  let data = "";
  let idBuffer = lastEventId;
  let blockId = "";
  const tooLarge = () => new SSEError("event_too_large", `evento SSE acima de ${maxEventLength}`);

  function line(text: string): SSEMessage | undefined {
    if (text.length > maxEventLength) throw tooLarge();
    if (text === "") {
      state.lastEventId = idBuffer;
      // O evento leva o id do próprio bloco, como o `parseSSEBlock` da raiz; o último id recebido
      // (que persiste entre eventos, como no EventSource) fica em `state` para a reconexão.
      const message = data && { event, data: data.slice(0, -1), id: blockId };
      event = "";
      data = "";
      blockId = "";
      return message || undefined;
    }
    if (text.startsWith(":")) return;
    const colon = text.indexOf(":");
    const field = colon === -1 ? text : text.slice(0, colon);
    const raw = colon === -1 ? "" : text.slice(colon + 1);
    const value = raw.startsWith(" ") ? raw.slice(1) : raw;
    if (field === "event") event = value;
    else if (field === "data") {
      data += `${value}\n`;
      if (data.length > maxEventLength) throw tooLarge();
    } else if (field === "id" && !value.includes("\u0000")) {
      idBuffer = value;
      blockId = value;
    } else if (field === "retry" && /^\d+$/.test(value)) state.retryMs = Number(value);
  }

  /** Recebe o próximo pedaço já decodificado e devolve os eventos que ele completou. */
  function push(text: string): SSEMessage[] {
    let chunk = text;
    // Pedaço vazio (só metade de um caractere multibyte) não decide se o CR anterior era CRLF.
    if (skipLF && chunk !== "") {
      skipLF = false;
      if (chunk.startsWith("\n")) chunk = chunk.slice(1);
    }
    const lineEnd = /\r\n|\r|\n/g;
    lineEnd.lastIndex = pending.length;
    pending += chunk;
    const messages: SSEMessage[] = [];
    let start = 0;
    for (let match = lineEnd.exec(pending); match; match = lineEnd.exec(pending)) {
      const message = line(pending.slice(start, match.index));
      if (message) messages.push(message);
      start = lineEnd.lastIndex;
    }
    if (pending.endsWith("\r")) skipLF = true;
    pending = pending.slice(start);
    if (pending.length > maxEventLength) throw tooLarge();
    return messages;
  }

  return { push, state };
}

/** Schemas zod do contrato, sob demanda: só o zod pesa ~89 kB (25 kB gzip) e levaria o JS
 * principal acima do aviso de 500 kB do Vite. O chunk vem no primeiro stream e fica em cache; se
 * não baixar, o stream seguinte tenta de novo. */
const importContract = retryImport(() => import("../../../../src/types/sse.ts"));
const loadSchemas = () =>
  importContract().then(
    (contract) =>
      ({
        chunk: contract.StreamChunkSchema,
        metadata: contract.StreamMetadataSchema,
        tool_call: contract.StreamToolCallSchema,
        error: contract.StreamErrorSchema,
        done: contract.StreamDoneSchema,
      }) satisfies Record<SSEEvent["event"], unknown>,
  );
type Schemas = Awaited<ReturnType<typeof loadSchemas>>;

/**
 * Valida o payload com os schemas do contrato (`src/types/sse.ts`). Bloco sem `event:` é `chunk`,
 * como no `parseSSEBlock` da raiz; evento que o contrato não conhece é ignorado (o gateway pode
 * ganhar eventos novos); evento conhecido com payload errado é falha, não texto sumindo calado.
 */
function toStudioEvent(message: SSEMessage, schemas: Schemas): SSEEvent | null {
  const event = message.event || "chunk";
  if (!Object.hasOwn(schemas, event)) return null;
  let json: unknown;
  try {
    json = JSON.parse(message.data);
  } catch {
    throw new SSEError("invalid_event", `evento "${event}" com data que não é JSON`);
  }
  const parsed = schemas[event as SSEEvent["event"]].safeParse(json);
  if (!parsed.success) throw new SSEError("invalid_event", `evento "${event}" fora do contrato`);
  return { event, data: parsed.data, ...(message.id ? { id: message.id } : {}) } as SSEEvent;
}

/** Atraso da reconexão `attempt` (0, 1, 2…): exponencial até o teto, com jitter "equal" (metade
 * fixa, metade sorteada) para clientes que caíram juntos não voltarem juntos. */
export function backoffDelay(attempt: number, baseMs: number, maxMs: number) {
  const ceiling = Math.min(maxMs, baseMs * 2 ** Math.min(attempt, 30));
  return ceiling / 2 + (Math.random() * ceiling) / 2;
}

const retryable = (status: number) => status === 408 || status === 429 || status >= 500;

/** Retry-After em segundos, como o rate limiter do gateway manda. ponytail: data HTTP é ignorada. */
const retryAfterMs = (header: string | null) =>
  header && /^\d+$/.test(header) ? Number(header) * 1000 : 0;

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve();
    const wake = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", wake);
      resolve();
    };
    const timer = setTimeout(wake, ms);
    signal?.addEventListener("abort", wake);
  });
}

/**
 * Lê o stream SSE do gateway como eventos do contrato da raiz, reconectando sozinho: queda de
 * rede, stream que termina sem `done` e status 408/429/5xx voltam com `Last-Event-ID` (o ring
 * buffer do gateway reenvia o que faltou) e backoff com jitter. `done` e `error` encerram.
 * Abortar o `signal` ou sair do `for await` fecha a conexão — é o aviso de cancelamento ao
 * gateway — e encerra sem erro. Falha definitiva lança `SSEError`.
 */
export async function* readSSE(
  request: SSERequest,
  options: SSEOptions = {},
): AsyncGenerator<SSEEvent, void, undefined> {
  const { signal, maxRetries = 5, baseDelayMs = 1000, maxDelayMs = 30_000 } = options;
  let lastEventId = "";
  let retryMs: number | undefined;
  let failures = 0;
  let delivered = 0;
  // Antes do primeiro pedido: sem o contrato não há como validar, e reconectar repetiria o pedido.
  const schemas = await loadSchemas();

  while (!signal?.aborted) {
    const connection = new AbortController();
    const close = () => connection.abort();
    signal?.addEventListener("abort", close);
    let cause: unknown;
    let waitMs = 0;
    try {
      const headers = new Headers(request.headers);
      headers.set("Accept", "text/event-stream");
      if (lastEventId) headers.set("Last-Event-ID", lastEventId);
      const { method = "GET", body, url } = request;
      const response = await fetch(url, { method, headers, body, signal: connection.signal });
      const type = response.headers.get("Content-Type")?.split(";")[0]?.trim().toLowerCase();
      if (response.status !== 200) {
        const { status } = response;
        cause = new SSEError("http_status", `o gateway respondeu ${status}`, { status });
        if (!retryable(status)) throw cause;
        waitMs = retryAfterMs(response.headers.get("Retry-After"));
      } else if (type !== "text/event-stream" || !response.body) {
        throw new SSEError("bad_content_type", "a resposta do gateway não é text/event-stream");
      } else {
        const parser = createSSEParser({ lastEventId, maxEventLength: options.maxEventLength });
        const reader = response.body.getReader();
        // Sem await: com o corpo clonado (MSW, service worker) o cancel só resolve quando todos os
        // ramos cancelam. A leitura pendente volta na hora com done mesmo assim.
        connection.signal.addEventListener("abort", () => {
          reader.cancel().catch(() => undefined);
        });
        const decoder = new TextDecoder();
        try {
          for (;;) {
            const { done, value } = await reader.read();
            const text = done ? decoder.decode() : decoder.decode(value, { stream: true });
            for (const message of parser.push(text)) {
              const event = toStudioEvent(message, schemas);
              if (!event) continue;
              failures = 0;
              delivered++;
              yield event;
              if (event.event === "done" || event.event === "error") return;
            }
            if (done) break;
          }
        } finally {
          lastEventId = parser.state.lastEventId;
          retryMs = parser.state.retryMs ?? retryMs;
        }
        cause = new Error("o stream terminou sem o evento done");
      }
    } catch (error) {
      if (signal?.aborted) return;
      if (error instanceof SSEError) throw error;
      cause = error; // rede: o fetch rejeitou ou a leitura caiu no meio
    } finally {
      signal?.removeEventListener("abort", close);
      connection.abort();
    }
    if (signal?.aborted) return;
    // Sem id não há como retomar: reabrir repetiria o pedido (texto duplicado, custo em dobro).
    if (delivered > 0 && !lastEventId) {
      throw new SSEError("interrupted", "a conexão caiu sem id para retomar", { cause });
    }
    if (failures >= maxRetries) {
      throw new SSEError("retries_exhausted", `sem resposta em ${maxRetries} tentativas`, {
        cause,
      });
    }
    const backoff = backoffDelay(failures, retryMs ?? baseDelayMs, maxDelayMs);
    const delayMs = Math.min(maxDelayMs, Math.max(waitMs, backoff));
    failures++;
    options.onRetry?.({ attempt: failures, delayMs, lastEventId, cause });
    await sleep(delayMs, signal);
  }
}
