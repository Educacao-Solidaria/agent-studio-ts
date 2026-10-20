import { ws } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { server } from "../mocks/node.ts";
import {
  CONNECTION_CLOSED,
  MAX_IN_FLIGHT,
  MAX_MESSAGE_BYTES,
  type WebSocketTransportOptions as Options,
  WebSocketTransport,
} from "./websocket-transport.ts";

const URL_WS = "ws://gateway.test/mcp/ws";
type Client = { send: (data: string | ArrayBuffer) => void; close: (code?: number) => void };

/** Gateway falso do contrato §3: anota o que chega e o teste responde; `accept(n)` = aceita a n-ésima. */
function fakeGateway(accept = (_n: number) => true) {
  const gateway = { received: [] as Record<string, unknown>[], clients: [] as Client[] };
  const extra = { protocols: [] as unknown[], closes: [] as number[] };
  const parse = (data: unknown) => gateway.received.push(JSON.parse(`${data}`));
  server.use(
    ws.link(URL_WS).addEventListener("connection", ({ client, info }) => {
      extra.protocols.push(info.protocols);
      if (!accept(gateway.clients.push(client) - 1)) return client.close(1006); // handshake recusado
      client.addEventListener("message", (event) => parse(event.data));
      client.addEventListener("close", (event) => extra.closes.push(event.code));
    }),
  );
  const push = (message: unknown) => gateway.clients.at(-1)?.send(JSON.stringify(message));
  const reply = (id: unknown) => push({ jsonrpc: "2.0", id, result: {} });
  const seen = () => gateway.received.map((m) => m.id ?? m.method);
  return Object.assign(gateway, extra, { push, reply, seen });
}

const request = (id: number | string) => ({ jsonrpc: "2.0", id, method: "tools/list" });
const note = (method: string, params?: object) => ({ jsonrpc: "2.0", method, params });
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const created: WebSocketTransport[] = [];
afterEach(async () => {
  for (const transport of created.splice(0)) await transport.disconnect();
});

/** Transporte que anota mensagens e erros; com `open`, já conectado ao gateway falso. */
async function connected(options?: Options, gateway = fakeGateway(), open = true) {
  const log = { messages: [] as unknown[], errors: [] as string[] };
  const mcp = Object.assign(new WebSocketTransport(options), log);
  mcp.onMessage((message) => log.messages.push(message));
  mcp.onError((error) => log.errors.push(error.message));
  created.push(mcp);
  if (open) await mcp.connect(URL_WS);
  return { mcp, gateway };
}

describe("WebSocketTransport", () => {
  it("pede o subprotocolo mcp; frame de texto = mensagem, na ordem; lixo do servidor vira erro", async () => {
    const { mcp, gateway } = await connected();
    mcp.onMessage(() => {
      throw new Error("handler quebrado"); // vira erro e não impede os outros handlers
    });
    await mcp.send(request(1));
    await expect(mcp.connect(URL_WS)).rejects.toThrow("já conectado");
    await tick();
    expect([gateway.protocols, gateway.received]).toEqual([["mcp"], [request(1)]]);
    gateway.reply(1);
    gateway.clients[0]?.send(new Uint8Array([1, 2]).buffer);
    gateway.clients[0]?.send("{");
    for (const n of [1, 2]) gateway.push(note("notifications/progress", { n }));
    await tick();
    const progress = [1, 2].map((n) => note("notifications/progress", { n }));
    expect(mcp.messages).toEqual([{ jsonrpc: "2.0", id: 1, result: {} }, ...progress]);
    const broken = "handler quebrado";
    const junk = ["frame binário ignorado", "mensagem do servidor não é JSON"];
    expect(mcp.errors).toEqual([broken, ...junk, broken, broken]);
  });

  it("até 16 em curso: a 17ª espera uma resposta; notificação e resposta não esperam vaga", async () => {
    const { mcp, gateway } = await connected();
    const sent: number[] = [];
    for (let id = 1; id <= MAX_IN_FLIGHT + 2; id++) mcp.send(request(id)).then(() => sent.push(id));
    await mcp.send(note("notifications/roots/list_changed"));
    await mcp.send({ jsonrpc: "2.0", id: "s1", result: {} }); // resposta a um pedido do servidor
    await tick();
    const first16 = first(MAX_IN_FLIGHT);
    expect(gateway.seen()).toEqual([...first16, "notifications/roots/list_changed", "s1"]);
    expect(sent).toEqual(first16);
    gateway.reply(3);
    await tick();
    expect(gateway.seen().slice(18)).toEqual([17]);
    gateway.reply(1);
    await tick();
    expect([gateway.seen().slice(18), sent]).toEqual([
      [17, 18],
      [...first16, 17, 18],
    ]);
  });

  it("cancelar devolve a vaga: o servidor não responde à requisição cancelada", async () => {
    const { mcp, gateway } = await connected();
    for (let id = 1; id <= MAX_IN_FLIGHT + 1; id++) mcp.send(request(id));
    const cancel = note("notifications/cancelled", { requestId: 5 });
    await mcp.send(cancel);
    await tick();
    expect(gateway.received.slice(MAX_IN_FLIGHT)).toEqual([cancel, request(17)]);
  });

  it("recusa sem enviar: acima de 1 MiB (em bytes), payload inválido ou lote", async () => {
    const { mcp, gateway } = await connected();
    const base = JSON.stringify(note("x", { t: "" })).length;
    const sized = (bytes: number) => note("x", { t: "a".repeat(bytes - base) });
    const accented = note("x", { t: "é".repeat(MAX_MESSAGE_BYTES / 2) }); // 2 bytes cada "é"
    await mcp.send(sized(MAX_MESSAGE_BYTES)); // exatamente 1 MiB passa
    for (const big of [sized(MAX_MESSAGE_BYTES + 1), accented]) {
      await expect(mcp.send(big)).rejects.toThrow(/1 MiB/);
    }
    const invalid = [{ jsonrpc: "2.0", id: 2 }, [request(3)], { ...request(4), jsonrpc: "1.0" }];
    for (const message of invalid) await expect(mcp.send(message)).rejects.toThrow(/inválido/);
    await mcp.send(request(6)); // a conexão seguiu aberta
    await tick();
    expect([gateway.seen(), mcp.errors.length]).toEqual([["x", 6], 5]);
  });

  it("queda: em curso recebe -32000, quem esperava é recusado, e reconecta com sessão nova", async () => {
    const onReconnect = vi.fn();
    const options = { maxRetries: 1, baseDelayMs: 1, maxDelayMs: 2, onReconnect };
    const { mcp, gateway } = await connected(options);
    for (let id = 1; id <= MAX_IN_FLIGHT; id++) await mcp.send(request(id));
    const waiting = mcp.send(request(MAX_IN_FLIGHT + 1));
    await tick();
    gateway.clients[0]?.close(1001);
    const reason = "a conexão caiu antes da resposta (código 1001)";
    await expect(waiting).rejects.toThrow(reason);
    await vi.waitFor(() => expect(onReconnect).toHaveBeenCalledOnce());
    const error = { code: CONNECTION_CLOSED, message: reason };
    expect(mcp.messages).toEqual(first(MAX_IN_FLIGHT).map((id) => ({ jsonrpc: "2.0", id, error })));
    expect(mcp.errors).toEqual(["a conexão WebSocket do MCP caiu (código 1001)"]);
    await mcp.send(request(1)); // sessão nova: nada da anterior ocupa vaga
    await tick();
    expect([gateway.clients.length, gateway.received.at(-1)]).toEqual([2, request(1)]);
    // Abrir zera as tentativas: com maxRetries 1, a segunda queda também reconecta.
    gateway.clients[1]?.close(1006);
    await vi.waitFor(() => expect(onReconnect).toHaveBeenCalledTimes(2));
  });

  it("desconectar fecha com 1000 e não reconecta; handshake recusado também não", async () => {
    const { mcp, gateway } = await connected({ baseDelayMs: 1 });
    await mcp.disconnect();
    await tick(20);
    expect([gateway.closes, gateway.clients.length, mcp.errors]).toEqual([[1000], 1, []]);
    await expect(mcp.send(request(1))).rejects.toThrow("desconectado");

    server.resetHandlers(); // o gateway acima também atenderia a URL
    const refused = await connected(
      { baseDelayMs: 1 },
      fakeGateway(() => false),
      false,
    );
    await expect(refused.mcp.connect(URL_WS)).rejects.toThrow("não abriu (código 1006)");
    await tick(20);
    expect(refused.gateway.clients).toHaveLength(1);

    // Desconectar no meio de uma tentativa de reconexão: ela falha e nada tenta de novo.
    server.resetHandlers();
    let during: WebSocketTransport | undefined;
    const midway = fakeGateway((n) => {
      if (n === 1) during?.disconnect();
      return n === 0;
    });
    during = (await connected({ baseDelayMs: 1, maxDelayMs: 2 }, midway)).mcp;
    midway.clients[0]?.close(1006);
    await tick(30);
    expect(midway.clients).toHaveLength(2);
  });

  it("depois de cair, desiste em maxRetries tentativas seguidas; NaN = nenhuma", async () => {
    const cases = [
      [3, 4],
      [Number.NaN, 1],
    ] as const; // [maxRetries, conexões no total]
    for (const [maxRetries, connections] of cases) {
      server.resetHandlers();
      const options = { maxRetries, baseDelayMs: 1, maxDelayMs: 2 };
      const { mcp, gateway } = await connected(
        options,
        fakeGateway((n) => n === 0),
      );
      gateway.clients[0]?.close(1006);
      const gaveUp = `depois de ${maxRetries} tentativas`;
      await vi.waitFor(() => expect(mcp.errors.at(-1)).toMatch(gaveUp));
      await tick(20);
      expect(gateway.clients).toHaveLength(connections);
    }
  });
});

function first(count: number) {
  return Array.from({ length: count }, (_, i) => i + 1);
}
