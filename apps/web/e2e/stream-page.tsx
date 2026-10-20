import { setupWorker } from "msw/browser";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { AutoScroll } from "../src/chat/auto-scroll.tsx";
import { CodeBlock } from "../src/chat/code-block.tsx";
import { splitFences } from "../src/chat/fences.ts";
import { StopButton, useStreamControl } from "../src/chat/stream-control.tsx";
import { TtftIndicator, useTtft } from "../src/chat/ttft.tsx";
import { Button } from "../src/components/ui/button.tsx";
import "../src/styles/globals.css";
import { connections, handlers, SCENARIOS, type Scenario } from "./stream-mock.ts";

/** Uma resposta por vez com as peças do Victor: leitor SSE + parar, TTFT, auto-scroll e destaque.
 * O painel de chat de verdade é do Luan (PR 54); aqui é só o mínimo que o teste e2e precisa. */
function StreamPage() {
  const { scopeRef, streaming, run, stop } = useStreamControl();
  const ttft = useTtft();
  const [text, setText] = useState("");
  const [outcome, setOutcome] = useState("");
  async function send(scenario: Scenario) {
    setText("");
    setOutcome("");
    const measure = ttft.start();
    const request = {
      url: "/e2e/chat",
      method: "POST" as const,
      body: JSON.stringify({ scenario }),
    };
    try {
      const done = await run(
        request,
        (event) => {
          measure.observe(event);
          if (event.event === "chunk") setText((current) => current + event.data.delta_content);
        },
        { baseDelayMs: 100 },
      );
      measure.stop();
      setOutcome(done);
    } catch (error) {
      measure.stop();
      setOutcome(`erro: ${error instanceof Error ? error.message : error}`);
    }
  }
  return (
    <div ref={scopeRef} className="flex h-dvh flex-col gap-2 p-4">
      <textarea aria-label="Mensagem" className="rounded-md border p-2" rows={2} />
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(SCENARIOS) as Scenario[]).map((scenario) => (
          <Button key={scenario} size="sm" onClick={() => send(scenario)}>
            {scenario}
          </Button>
        ))}
        {streaming && <StopButton onStop={stop} />}
        <TtftIndicator state={ttft.state} />
        <output data-testid="outcome">{outcome}</output>
      </div>
      <AutoScroll className="flex-1 rounded-md border">
        <article data-testid="reply" className="p-3">
          {splitFences(text).map((segment, index) =>
            segment.kind === "code" ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: o texto só cresce no fim
              <CodeBlock key={index} code={segment.code} lang={segment.lang} />
            ) : (
              // biome-ignore lint/suspicious/noArrayIndexKey: o texto só cresce no fim
              <p key={index} className="whitespace-pre-wrap">
                {segment.text}
              </p>
            ),
          )}
        </article>
      </AutoScroll>
    </div>
  );
}

Object.assign(window, { e2eConnections: connections });
await setupWorker(...handlers).start({ onUnhandledRequest: "bypass", quiet: true });
const root = document.getElementById("root");
if (root) createRoot(root).render(<StreamPage />);
