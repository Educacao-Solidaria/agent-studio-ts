import type { McpTransport } from "../../../../src/mcp/client.ts";
import { backoffDelay } from "../chat/sse-reader.ts";

// Contrato §3 (`internal/mcpws` do gateway): subprotocolo, teto por mensagem (acima, fecha com
// 1009) e por requisições em curso (a 17ª volta -32603). -32000 é o "conexão fechada" do SDK do
// MCP: a resposta que o próprio transporte dá à requisição que a queda deixou sem resposta.
export const PROTOCOL = "mcp";
export const MAX_MESSAGE_BYTES = 1 << 20;
export const MAX_IN_FLIGHT = 16;
export const CONNECTION_CLOSED = -32000;

type Id = string | number;
type Waiting = { text: string; id: Id; resolve: () => void; reject: (error: Error) => void };
type Envelope = { id: Id; method?: string; params?: { requestId?: unknown } };

export interface WebSocketTransportOptions {
  maxRetries?: number; // reconexões seguidas sem abrir antes de desistir; 0 = nenhuma
  baseDelayMs?: number;
  maxDelayMs?: number;
  onReconnect?: () => void; // a conexão voltou: sessão nova no servidor, refaça o `initialize`
}

const encoder = new TextEncoder();
const isId = (value: unknown): value is Id =>
  typeof value === "string" || typeof value === "number";

/** Requisição (ocupa vaga), notificação, resposta a um pedido do servidor ou inválida. */
function kindOf(message: unknown) {
  if (typeof message !== "object" || message === null) return undefined; // lote cai no jsonrpc
  const { jsonrpc, method, id } = message as Record<string, unknown>;
  if (jsonrpc !== "2.0") return undefined;
  if (typeof method === "string" && id === undefined) return "notification";
  if (typeof method === "string") return isId(id) ? "request" : undefined;
  return isId(id) && ("result" in message || "error" in message) ? "response" : undefined;
}

/**
 * `McpTransport` da raiz por WebSocket. Requisições saem na ordem, até 16 em curso; notificação e
 * resposta não esperam vaga (resposta presa atrás de requisições travaria o servidor que depende
 * dela). Queda fora do `disconnect` reconecta com backoff e jitter; nada passa de uma sessão a outra.
 */
export class WebSocketTransport implements McpTransport {
  #socket?: WebSocket;
  #url = "";
  #closing = false;
  #failures = 0;
  #retry?: ReturnType<typeof setTimeout>;
  readonly #inFlight = new Set<Id>();
  #waiting: Waiting[] = [];
  readonly #messageHandlers: Array<(data: unknown) => void> = [];
  readonly #errorHandlers: Array<(error: Error) => void> = [];

  constructor(private readonly options: WebSocketTransportOptions = {}) {}

  async connect(url: string): Promise<void> {
    if (this.#socket) throw new Error("WebSocket do MCP já conectado.");
    clearTimeout(this.#retry); // conectar na mão vence a reconexão que esperava
    [this.#url, this.#closing, this.#failures] = [url, false, 0];
    await this.#open();
  }

  async disconnect(): Promise<void> {
    this.#closing = true;
    clearTimeout(this.#retry);
    const socket = this.#socket;
    this.#socket = undefined;
    socket?.close(1000);
    this.#settle("o transporte foi desconectado");
  }

  async send(message: unknown): Promise<void> {
    const kind = kindOf(message);
    if (!kind) throw this.#error(new Error("Payload JSON-RPC 2.0 inválido."));
    const socket = this.#socket;
    if (socket?.readyState !== WebSocket.OPEN) throw this.#error(new Error("desconectado"));
    const text = JSON.stringify(message);
    if (encoder.encode(text).length > MAX_MESSAGE_BYTES) {
      throw this.#error(new Error("mensagem acima de 1 MiB: o servidor fecharia a conexão"));
    }
    const { id, method, params } = message as Envelope;
    if (kind !== "request") {
      socket.send(text);
      // MCP: o servidor não deve responder à cancelada, então a vaga volta aqui. Se ele ainda
      // estiver nela, a próxima pode voltar -32603 — erro, não trava.
      const cancelled = method === "notifications/cancelled" ? params?.requestId : undefined;
      if (isId(cancelled) && this.#inFlight.delete(cancelled)) this.#flush();
      return;
    }
    return new Promise((resolve, reject) => {
      this.#waiting.push({ text, id, resolve, reject });
      this.#flush();
    });
  }

  onMessage(handler: (data: unknown) => void): void {
    this.#messageHandlers.push(handler);
  }

  onError(handler: (error: Error) => void): void {
    this.#errorHandlers.push(handler);
  }

  /** Abre a conexão (o servidor recusa o handshake sem o subprotocolo); rejeita se fechar antes. */
  #open() {
    return new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(this.#url, PROTOCOL);
      let open = false;
      this.#socket = socket;
      socket.onopen = () => {
        [open, this.#failures] = [true, 0];
        resolve();
      };
      socket.onmessage = (event) => this.#receive(event.data);
      socket.onclose = ({ code }) => {
        const current = socket === this.#socket;
        if (current) this.#socket = undefined;
        if (!open) return reject(new Error(`o WebSocket do MCP não abriu (código ${code})`));
        if (!current) return; // fechada por nós
        this.#settle(`a conexão caiu antes da resposta (código ${code})`);
        this.#error(new Error(`a conexão WebSocket do MCP caiu (código ${code})`));
        this.#reconnect();
      };
    });
  }

  #reconnect() {
    const { maxRetries = 5, baseDelayMs = 1000, maxDelayMs = 30_000, onReconnect } = this.options;
    if (this.#closing) return;
    // `!(a < b)` e não `a >= b`: com NaN desiste em vez de reconectar para sempre.
    if (!(this.#failures < maxRetries)) {
      this.#error(new Error(`WebSocket do MCP sem conexão depois de ${maxRetries} tentativas`));
      return;
    }
    const reopen = () => this.#open().then(onReconnect, () => this.#reconnect());
    this.#retry = setTimeout(reopen, backoffDelay(this.#failures++, baseDelayMs, maxDelayMs));
  }

  /** Requisição sem resposta recebe o erro do próprio transporte; quem esperava vaga é recusado. */
  #settle(reason: string) {
    const lost = [...this.#inFlight];
    this.#inFlight.clear();
    for (const { reject } of this.#waiting.splice(0)) reject(new Error(reason));
    for (const id of lost) {
      this.#deliver({ jsonrpc: "2.0", id, error: { code: CONNECTION_CLOSED, message: reason } });
    }
  }

  #flush() {
    const socket = this.#socket;
    while (socket?.readyState === WebSocket.OPEN && this.#inFlight.size < MAX_IN_FLIGHT) {
      const next = this.#waiting.shift();
      if (!next) return;
      this.#inFlight.add(next.id);
      socket.send(next.text);
      next.resolve();
    }
  }

  #receive(data: unknown) {
    if (typeof data !== "string") return void this.#error(new Error("frame binário ignorado"));
    let message: unknown;
    try {
      message = JSON.parse(data);
    } catch {
      return void this.#error(new Error("mensagem do servidor não é JSON"));
    }
    const { id, method } = (message ?? {}) as { id?: unknown; method?: unknown };
    // Resposta libera a vaga da requisição dela (a que esperava sai agora).
    if (method === undefined && isId(id) && this.#inFlight.delete(id)) this.#flush();
    this.#deliver(message);
  }

  /** Handler que lança vira erro e não impede os outros (nem a reconexão, na queda). */
  #deliver(message: unknown) {
    for (const handler of this.#messageHandlers) {
      try {
        handler(message);
      } catch (error) {
        this.#error(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  #error(error: Error) {
    for (const handler of this.#errorHandlers) handler(error);
    return error;
  }
}
