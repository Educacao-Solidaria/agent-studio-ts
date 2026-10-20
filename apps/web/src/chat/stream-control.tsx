import { useCallback, useEffect, useRef, useState } from "react";
import type { SSEEvent } from "../../../../src/types/sse.ts";
import { Icon } from "../components/icons.tsx";
import { Button } from "../components/ui/button.tsx";
import { readSSE, type SSEOptions, type SSERequest } from "./sse-reader.ts";

/** Como a resposta terminou: inteira (`done`/`error` do gateway, ou fim do stream) ou parada. */
export type StreamOutcome = "done" | "stopped";

/**
 * Controle da resposta em curso: um `AbortController` por stream, ligado ao leitor do PR 51.
 * Parar fecha a conexão na hora — é o aviso ao gateway, que cancela a chamada ao modelo quando o
 * cliente cai (PR 44 do Luan) — e o que já chegou fica. Parar é idempotente (de novo, ou sem
 * nada em curso, não faz nada); começar outra resposta para a anterior; desmontar também para.
 * Esc dentro de `scopeRef` para, só enquanto há resposta em curso (ver `claimEscape`).
 */
export function useStreamControl() {
  const scopeRef = useRef<HTMLDivElement>(null);
  const current = useRef<AbortController | null>(null);
  const [streaming, setStreaming] = useState(false);

  const stop = useCallback(() => {
    const controller = current.current;
    if (!controller) return; // o `finally` do `run` limpa a ref
    controller.abort();
    setStreaming(false);
    // O botão Parar some com o stream: quem estava nele volta para o campo de texto do chat.
    const scope = scopeRef.current;
    const focused = document.activeElement;
    if (scope && focused instanceof HTMLButtonElement && scope.contains(focused)) {
      (scope.querySelector<HTMLElement>("textarea, input") ?? scope).focus();
    }
  }, []);

  const run = useCallback(
    async (
      request: SSERequest,
      onEvent: (event: SSEEvent) => void,
      options: Omit<SSEOptions, "signal"> = {},
    ): Promise<StreamOutcome> => {
      current.current?.abort();
      const controller = new AbortController();
      current.current = controller;
      setStreaming(true);
      try {
        for await (const event of readSSE(request, { ...options, signal: controller.signal })) {
          onEvent(event);
        }
        return controller.signal.aborted ? "stopped" : "done";
      } finally {
        if (current.current === controller) {
          current.current = null;
          setStreaming(false);
        }
      }
    },
    [],
  );

  useEffect(() => () => current.current?.abort(), []);

  useEffect(() => {
    if (!streaming) return;
    const onKeyDown = (event: KeyboardEvent) => claimEscape(event, scopeRef.current) && stop();
    // No documento, depois de tudo: quem tratou o Esc antes (o Radix fechando um menu ou um
    // diálogo chama preventDefault) passa na frente, e o Esc do painel do nó fica com ele.
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [streaming, stop]);

  return { scopeRef, streaming, run, stop };
}

/** Esc que é do chat: dentro do escopo (no DOM — o portal de um diálogo fica fora), sem ninguém
 * ter tratado antes e fora da composição de um IME (lá o Esc cancela a composição). */
function claimEscape(event: KeyboardEvent, scope: HTMLElement | null) {
  const mine = event.target instanceof Node && scope?.contains(event.target);
  if (event.key !== "Escape" || !mine || event.defaultPrevented || event.isComposing) return false;
  event.preventDefault();
  return true;
}

/** Botão de parar a resposta, para o lugar do Enviar enquanto `streaming`. */
export function StopButton({ onStop, className }: { onStop: () => void; className?: string }) {
  return (
    <Button
      variant="secondary"
      size="sm"
      className={className}
      onClick={onStop}
      aria-keyshortcuts="Escape"
      title="Parar a resposta (Esc)"
    >
      <Icon name="stop" />
      Parar
    </Button>
  );
}
