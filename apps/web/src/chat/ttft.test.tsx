import { act, render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SSEEvent } from "../../../../src/types/sse.ts";
import { TtftIndicator, type TtftMeasurement, type TtftState, ttftOf, useTtft } from "./ttft.tsx";

const chunk = (delta_content: string): SSEEvent => ({
  event: "chunk",
  data: { id: "c1", model: "openai/gpt-4o", delta_content, is_last: false },
});
const toolCall: SSEEvent = {
  event: "tool_call",
  data: { index: 0, id: "t1", name: "buscar", arguments_delta: "{" },
};
const done: SSEEvent = {
  event: "done",
  data: { finish_reason: "stop", total_tokens: 0, duration_ms: 9 },
};
const failure: SSEEvent = {
  event: "error",
  data: { code: "upstream", message: "x", retryable: false },
};
const metadata: SSEEvent = {
  event: "metadata",
  data: {
    ttft_ms: 1,
    total_duration_ms: 1,
    prompt_tokens: 1,
    completion_tokens: 0,
    total_tokens: 1,
    cached: false,
    model: "m",
  },
};

/** O hook com um relógio de mentira. O relógio anda antes do render (que vem depois do evento,
 * no fim do `act`): o tempo tem de ser lido na hora do evento. */
function measure() {
  let now = 1_000;
  const clock = () => now;
  const { result } = renderHook(() => useTtft(clock));
  const at = <T,>(ms: number, step: () => T) => {
    now = ms;
    let value: T | undefined;
    act(() => {
      value = step();
      now = ms + 5_000;
    });
    return value as T;
  };
  return { result, at, start: (ms: number) => at(ms, () => result.current.start()) };
}

describe("useTtft", () => {
  it("do envio ao primeiro texto: pedaço vazio e metadata não contam; depois, nada muda", () => {
    const { result, at, start } = measure();
    expect(result.current.state).toEqual({ status: "idle" });
    const ttft = start(1_000);
    at(1_100, () => ttft.observe(chunk(""))); // o 1º pedaço de alguns modelos vem vazio
    at(1_150, () => ttft.observe(metadata));
    expect(result.current.state).toEqual({ status: "waiting", since: 1_000 });
    at(1_350, () => ttft.observe(chunk("Oi")));
    at(2_000, () => ttft.observe(chunk(" mais")));
    at(2_100, () => ttft.stop());
    expect(result.current.state).toEqual({ status: "done", ms: 350 });
  });

  it("chamada de ferramenta também é o primeiro token; relógio que volta não dá negativo", () => {
    const { result, at, start } = measure();
    const first = start(1_000);
    at(1_040, () => first.observe(toolCall));
    expect(result.current.state).toEqual({ status: "done", ms: 40 });
    const second = start(500);
    at(400, () => second.observe(chunk("a")));
    expect(result.current.state).toEqual({ status: "done", ms: 0 });
  });

  it("parar, `error` ou `done` antes do primeiro token: sem número", () => {
    const { result, at, start } = measure();
    for (const end of [(t: TtftMeasurement) => t.stop(), failure, done]) {
      const ttft = start(1_000);
      at(9_000, () => (typeof end === "function" ? end(ttft) : ttft.observe(end)));
      expect(result.current.state).toEqual({ status: "stopped" });
    }
  });

  it("cada envio mede só os seus eventos: o atrasado da resposta anterior não mexe no novo", () => {
    const { result, at, start } = measure();
    const old = start(1_000);
    const current = start(2_000);
    at(2_010, () => old.observe(chunk("velho")));
    at(2_020, () => old.stop());
    expect(result.current.state).toEqual({ status: "waiting", since: 2_000 });
    at(2_300, () => current.observe(chunk("novo")));
    expect(result.current.state).toEqual({ status: "done", ms: 300 });
  });
});

it("ttftOf: o valor guardado na mensagem; ausente ou não finito = nada a mostrar", () => {
  const message = { id: "a", role: "assistant", content: "", timestamp: 0 } as const;
  expect(ttftOf({ ...message, metadata: { ttftMs: 420 } })).toEqual({ status: "done", ms: 420 });
  expect(ttftOf(message)).toEqual({ status: "idle" });
  expect(ttftOf({ ...message, metadata: { ttftMs: Number.NaN } })).toEqual({ status: "idle" });
});

describe("TtftIndicator", () => {
  afterEach(() => vi.useRealTimers());
  const text = (container: HTMLElement) => container.textContent?.replace(/\s/g, " ");

  it("conta ao vivo a cada quadro enquanto espera, fixa no primeiro token e para o laço", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    let now = 1_000;
    const state: TtftState = { status: "waiting", since: 1_000 };
    const view = render(<TtftIndicator state={state} now={() => now} />);
    expect(text(view.container)).toBe("Primeiro token: 0 ms");
    expect(view.getByRole("timer").getAttribute("aria-busy")).toBe("true");
    now = 2_234;
    act(() => vi.advanceTimersToNextFrame());
    expect(text(view.container)).toBe("Primeiro token: 1.234 ms");
    view.rerender(<TtftIndicator state={{ status: "done", ms: 1_234.4 }} now={() => now} />);
    expect(vi.getTimerCount()).toBe(0); // fixou: nada mais redesenha
    expect(text(view.container)).toBe("Primeiro token: 1.234 ms");
    view.rerender(<TtftIndicator state={state} />);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0); // desmontar também para o laço
  });

  it("parado sem token mostra traço, não o tempo até a parada; ocioso não mostra nada", () => {
    const stopped = render(<TtftIndicator state={{ status: "stopped" }} />);
    expect(text(stopped.container)).toBe("Primeiro token: —");
    expect(stopped.getByRole("timer").title).toBe("A resposta parou antes do primeiro token");
    expect(render(<TtftIndicator state={{ status: "idle" }} />).container.innerHTML).toBe("");
  });
});
