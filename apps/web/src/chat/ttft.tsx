import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { ChatMessage } from "../../../../src/types/domain.ts";
import type { SSEEvent } from "../../../../src/types/sse.ts";
import { Icon } from "../components/icons.tsx";
import { EMPTY, formatNumber } from "../lib/format.ts";

/** Medição de uma resposta: esperando o 1º token desde `since`, medida, ou parada sem token. */
export type TtftState =
  | { status: "idle" }
  | { status: "waiting"; since: number }
  | { status: "done"; ms: number }
  | { status: "stopped" };

const clock = () => performance.now();

/** Primeiro token de verdade: texto não vazio ou chamada de ferramenta (o 1º pedaço pode vir vazio). */
export function isFirstToken(event: SSEEvent) {
  return (
    event.event === "tool_call" || (event.event === "chunk" && event.data.delta_content !== "")
  );
}

/** O TTFT guardado na mensagem (`metadata.ttftMs`), para as respostas que já terminaram. */
export function ttftOf(message: ChatMessage): TtftState {
  const ms = message.metadata?.ttftMs;
  return ms !== undefined && Number.isFinite(ms) ? { status: "done", ms } : { status: "idle" };
}

/** A medição de um envio: só os eventos dele contam. */
export type TtftMeasurement = { observe: (event: SSEEvent) => void; stop: () => void };

/**
 * Mede do envio ao primeiro token com `performance.now()`: `start()` no envio devolve a medição
 * dele — `observe(evento)` em cada evento do stream, `stop()` no abort ou na falha. Cada envio mede
 * só os próprios eventos: o que a resposta anterior ainda entregar depois de um `start()` novo
 * não mexe no número. `done`/`error` antes do primeiro token, ou parar antes dele, terminam sem
 * número — nunca o tempo até a parada no lugar do TTFT.
 */
export function useTtft(now: () => number = clock) {
  const [state, setState] = useState<TtftState>({ status: "idle" });
  const latest = useRef(0);
  const start = useCallback((): TtftMeasurement => {
    const mine = ++latest.current;
    setState({ status: "waiting", since: now() });
    const settle = (next: (since: number) => TtftState | undefined) => {
      if (mine !== latest.current) return; // envio velho
      setState((current) =>
        current.status === "waiting" ? (next(current.since) ?? current) : current,
      );
    };
    return {
      observe(event) {
        const at = now(); // na hora do evento: o updater só roda no próximo render
        settle((since) => {
          if (isFirstToken(event)) return { status: "done", ms: Math.max(0, at - since) };
          if (event.event === "done" || event.event === "error") return { status: "stopped" };
        });
      },
      stop: () => settle(() => ({ status: "stopped" })),
    };
  }, [now]);
  return { state, start };
}

const formatMs = (ms: number) =>
  formatNumber(ms, { style: "unit", unit: "millisecond", maximumFractionDigits: 0 });

/** Tempo até o primeiro token: conta ao vivo (por quadro) enquanto espera e fixa no primeiro. */
export function TtftIndicator({ state, now = clock }: { state: TtftState; now?: () => number }) {
  const [, redraw] = useReducer((frame: number) => frame + 1, 0);
  useEffect(() => {
    if (state.status !== "waiting") return;
    let frame = requestAnimationFrame(function loop() {
      redraw();
      frame = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(frame);
  }, [state]);

  if (state.status === "idle") return null;
  const waiting = state.status === "waiting";
  let value = EMPTY;
  if (state.status === "done") value = formatMs(state.ms);
  if (waiting) value = formatMs(now() - state.since);
  return (
    <span
      role="timer"
      aria-busy={waiting}
      title={state.status === "stopped" ? "A resposta parou antes do primeiro token" : undefined}
      className="inline-flex items-center gap-1 text-muted-foreground text-xs tabular-nums"
    >
      <Icon
        name={waiting ? "loading" : "queued"}
        className={waiting ? "motion-safe:animate-spin" : undefined}
      />
      Primeiro token: {value}
    </span>
  );
}
