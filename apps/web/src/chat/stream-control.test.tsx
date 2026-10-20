import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { http } from "msw";
import { describe, expect, it } from "vitest";
import type { SSEEvent } from "../../../../src/types/sse.ts";
import { server } from "../mocks/node.ts";
import { renderWithProviders } from "../test/render.tsx";
import { SSEError } from "./sse-reader.ts";
import { StopButton, type StreamOutcome, useStreamControl } from "./stream-control.tsx";

const STREAM_URL = "http://gateway.test/v1/chat";
const encoder = new TextEncoder();
const chunk = (text: string, id: string) =>
  `id: ${id}\nevent: chunk\ndata: {"id":"c1","model":"m","delta_content":"${text}","is_last":false}\n\n`;
const DONE = 'event: done\ndata: {"finish_reason":"stop","total_tokens":3,"duration_ms":9}\n\n';

/** Gateway falso: cada pedido recebe os pedaços na ordem; `open` mantém a conexão aberta. */
function gateway(parts: string[], { open = false, status = 200 } = {}) {
  const requests: Request[] = [];
  server.use(
    http.all(STREAM_URL, ({ request }) => {
      requests.push(request);
      const start = (stream: ReadableStreamDefaultController) => {
        for (const part of parts) stream.enqueue(encoder.encode(part));
        if (!open) stream.close();
      };
      const headers = { "Content-Type": "text/event-stream" };
      return new Response(status === 200 ? new ReadableStream({ start }) : null, {
        status,
        headers,
      });
    }),
  );
  return requests;
}

const control: { current?: ReturnType<typeof useStreamControl> } = {};
function Chat() {
  control.current = useStreamControl();
  return (
    <div ref={control.current.scopeRef}>
      <textarea aria-label="Mensagem" />
      {control.current.streaming && <StopButton onStop={control.current.stop} />}
    </div>
  );
}

/** Começa uma resposta e espera o primeiro evento chegar. Devolve a promessa embrulhada: uma
 * função async que devolve uma promessa espera por ela (e a conexão aberta nunca termina). */
async function start(events: SSEEvent[] = []) {
  let outcome: Promise<StreamOutcome> | undefined;
  act(() => {
    outcome = control.current?.run({ url: STREAM_URL, method: "POST" }, (e) => events.push(e));
  });
  await waitFor(() => expect(events.length).toBeGreaterThan(0));
  return { outcome: outcome as Promise<StreamOutcome> };
}

const stopButton = () => screen.queryByRole("button", { name: "Parar" });

describe("useStreamControl", () => {
  it("entrega os eventos e termina inteira", async () => {
    gateway([chunk("a", "1"), DONE]);
    renderWithProviders(<Chat />);
    const events: SSEEvent[] = [];
    const { outcome } = await start(events);
    expect(await outcome).toBe("done");
    expect(events.map((event) => event.event)).toEqual(["chunk", "done"]);
    expect(stopButton()).toBeNull();
  });

  it("Parar fecha a conexão na hora, guarda o que chegou, devolve o foco e é idempotente", async () => {
    const requests = gateway([chunk("a", "1")], { open: true });
    const { user } = renderWithProviders(<Chat />);
    const events: SSEEvent[] = [];
    const { outcome } = await start(events);
    const button = stopButton() as HTMLElement;
    expect(button.getAttribute("aria-keyshortcuts")).toBe("Escape");
    await user.click(button);
    expect(requests.map((request) => request.signal.aborted)).toEqual([true]);
    expect(await outcome).toBe("stopped");
    expect(events).toHaveLength(1);
    expect(stopButton()).toBeNull();
    expect(document.activeElement).toBe(screen.getByLabelText("Mensagem"));
    act(() => {
      control.current?.stop();
      control.current?.stop();
    });
    expect(requests).toHaveLength(1);
  });

  it("outra resposta para a anterior; desmontar para a que estiver em curso", async () => {
    const requests = gateway([chunk("a", "1")], { open: true });
    const { unmount } = renderWithProviders(<Chat />);
    const { outcome: first } = await start();
    const { outcome: second } = await start();
    expect(await first).toBe("stopped");
    expect(requests.map((request) => request.signal.aborted)).toEqual([true, false]);
    expect(stopButton()).not.toBeNull(); // a segunda segue
    unmount();
    expect(await second).toBe("stopped");
    expect(requests.map((request) => request.signal.aborted)).toEqual([true, true]);
  });

  it("falha do leitor sobe e libera o estado", async () => {
    gateway([], { status: 401 });
    renderWithProviders(<Chat />);
    let outcome: Promise<StreamOutcome> | undefined;
    act(() => {
      outcome = control.current?.run({ url: STREAM_URL }, () => undefined);
    });
    await expect(outcome).rejects.toBeInstanceOf(SSEError);
    await waitFor(() => expect(stopButton()).toBeNull());
  });

  it("Esc para só no chat, com resposta em curso, fora de IME e se ninguém tratou antes", async () => {
    const requests = gateway([chunk("a", "1")], { open: true });
    renderWithProviders(
      <>
        <Chat />
        <input aria-label="Campo do painel do nó" />
      </>,
    );
    const field = screen.getByLabelText("Mensagem");
    const esc = (target: Element, init = {}) =>
      fireEvent.keyDown(target, { key: "Escape", ...init });
    expect(esc(field)).toBe(true); // sem resposta em curso: o Esc segue livre
    const { outcome } = await start();
    expect(esc(screen.getByLabelText("Campo do painel do nó"))).toBe(true);
    expect(esc(field, { isComposing: true })).toBe(true);
    expect(fireEvent.keyDown(field, { key: "a" })).toBe(true);
    field.addEventListener("keydown", (event) => event.preventDefault(), { once: true });
    esc(field);
    expect(requests[0]?.signal.aborted).toBe(false);
    expect(esc(field)).toBe(false); // este é do chat: para e não deixa o Esc seguir
    expect(stopButton()).toBeNull(); // na hora, sem esperar o leitor terminar
    expect(await outcome).toBe("stopped");
    expect(requests[0]?.signal.aborted).toBe(true);
  });
});
