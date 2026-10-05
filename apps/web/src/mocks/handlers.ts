import { delay, HttpResponse, http } from "msw";

export const OPENROUTER_URL = "https://openrouter.ai/api/v1";

/** Resposta fixa do mock: o teste e a tela sabem exatamente o que esperar. */
export const MOCK_REPLY = "Olá! Sou um agente simulado pelo MSW.";
export const MOCK_MODEL = "openrouter/mock-model";
export const MOCK_USAGE = {
  prompt_tokens: 12,
  completion_tokens: 9,
  total_tokens: 21,
  cost: 0.00021,
};

type ChatRequest = { model?: string; stream?: boolean };

const encoder = new TextEncoder();
const sse = (data: unknown) => encoder.encode(`data: ${JSON.stringify(data)}\n\n`);

/**
 * Stream no formato do OpenRouter (compatível com OpenAI): comentário de keep-alive,
 * um chunk `delta` por palavra, um chunk final com `finish_reason` e `usage`, e `[DONE]`.
 */
function streamCompletion(id: string, model: string, chunkDelayMs: number) {
  const words = MOCK_REPLY.split(/(?<= )/);
  const chunk = (delta: object, extra: object = {}) => ({
    id,
    object: "chat.completion.chunk",
    model,
    choices: [{ index: 0, delta, finish_reason: null }],
    ...extra,
  });

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(": OPENROUTER PROCESSING\n\n"));
      for (const [i, word] of words.entries()) {
        await delay(chunkDelayMs);
        controller.enqueue(
          sse(chunk(i === 0 ? { role: "assistant", content: word } : { content: word })),
        );
      }
      controller.enqueue(
        sse(
          chunk(
            {},
            { choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: MOCK_USAGE },
          ),
        ),
      );
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}

/** Handlers compartilhados pelo worker (dev desconectado) e pelo setupServer (vitest). */
export function createHandlers({ chunkDelayMs = 40 } = {}) {
  return [
    http.get(`${OPENROUTER_URL}/models`, () =>
      HttpResponse.json({
        data: [
          {
            id: MOCK_MODEL,
            name: "Mock Model",
            pricing: { prompt: "0.000001", completion: "0.000002" },
          },
        ],
      }),
    ),

    http.post(`${OPENROUTER_URL}/chat/completions`, async ({ request }) => {
      const body = (await request.json()) as ChatRequest;
      const model = body.model ?? MOCK_MODEL;
      const id = `gen-mock-${Date.now()}`;

      if (body.stream) {
        return new HttpResponse(streamCompletion(id, model, chunkDelayMs), {
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
        });
      }
      return HttpResponse.json({
        id,
        object: "chat.completion",
        model,
        choices: [
          { index: 0, message: { role: "assistant", content: MOCK_REPLY }, finish_reason: "stop" },
        ],
        usage: MOCK_USAGE,
      });
    }),
  ];
}
