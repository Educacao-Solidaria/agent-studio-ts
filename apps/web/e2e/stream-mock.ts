import { delay, HttpResponse, http } from "msw";

/** Os pedaços de texto (`delta_content`) de cada cenário, na ordem em que saem. */
export const SCENARIOS = {
  acentos: [
    "Olá! Ação, ",
    "coração e pão — ",
    "🚀 漢字 ✓\n\n",
    "```ts\nconst saudação",
    ' = "olá";\n```\n',
    "Fim.",
  ],
  longo: Array.from({ length: 60 }, (_, i) => `Linha ${i + 1} do texto longo.\n`),
  lento: Array.from({ length: 40 }, (_, i) => `palavra${i + 1} `),
  queda: ["um ", "dois ", "três ", "quatro ", "cinco ", "seis."],
};
export type Scenario = keyof typeof SCENARIOS;
/** Espera do primeiro pedaço e entre pedaços, em ms: o TTFT e o ritmo que o teste espera. */
const PACE: Record<Scenario, [first: number, every: number]> = {
  acentos: [300, 30],
  longo: [0, 40],
  lento: [0, 150],
  queda: [0, 30],
};
const DROP_AFTER = 3; // "queda": a 1ª conexão cai depois do 3º evento

/** Cada conexão que o gateway falso recebeu (a página põe no `window` para o teste ler). */
export const connections: { scenario: Scenario; lastEventId: string | null }[] = [];

const encoder = new TextEncoder();
const frame = (id: number, event: string, data: object) =>
  encoder.encode(`id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

function stream(scenario: Scenario, from: number, drop: number) {
  const pieces = SCENARIOS[scenario];
  const [first, every] = PACE[scenario];
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      await delay(first);
      for (let i = from; i < pieces.length; i++) {
        if (i === drop) return controller.error(new Error("queda simulada"));
        const delta = {
          id: "gen-e2e",
          model: "e2e/mock",
          delta_content: pieces[i],
          is_last: false,
        };
        const bytes = frame(i + 1, "chunk", delta);
        // Corta o evento em dois pedaços de rede, no meio de um caractere de 2–4 bytes quando
        // houver: o leitor tem de juntar os bytes antes de decodificar.
        const cut = bytes.findIndex((byte) => (byte & 0xc0) === 0x80);
        const at = cut > 0 ? cut : bytes.length >> 1;
        controller.enqueue(bytes.slice(0, at));
        await delay(10);
        controller.enqueue(bytes.slice(at));
        await delay(every);
      }
      const done = { finish_reason: "stop", total_tokens: pieces.length, duration_ms: 1 };
      controller.enqueue(frame(pieces.length + 1, "done", done));
      controller.close();
    },
  });
}

/** `POST /e2e/chat` no formato SSE do gateway (`src/types/sse.ts` da raiz), com `id:` por evento:
 * a reconexão manda `Last-Event-ID` e o stream continua dali, como o ring buffer do gateway. */
export const handlers = [
  http.post("/e2e/chat", async ({ request }) => {
    const { scenario } = (await request.json()) as { scenario: Scenario };
    const lastEventId = request.headers.get("Last-Event-ID");
    connections.push({ scenario, lastEventId });
    const drop = scenario === "queda" && !lastEventId ? DROP_AFTER : -1;
    const body = stream(scenario, Number(lastEventId ?? 0), drop);
    return new HttpResponse(body, { headers: { "Content-Type": "text/event-stream" } });
  }),
];
