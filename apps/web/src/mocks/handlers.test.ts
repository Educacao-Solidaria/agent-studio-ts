import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { MOCK_MODEL, MOCK_REPLY, MOCK_USAGE, OPENROUTER_URL } from "./handlers.ts";
import { server } from "./node.ts";

const chat = (body: object) =>
  fetch(`${OPENROUTER_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

/** Lê o corpo SSE inteiro e devolve os payloads de cada `data:` (comentários ignorados). */
async function readEvents(response: Response) {
  const text = await response.text();
  return text
    .split("\n\n")
    .filter((event) => event.startsWith("data: "))
    .map((event) => event.slice("data: ".length));
}

describe("handlers do OpenRouter", () => {
  it("lista modelos", async () => {
    const response = await fetch(`${OPENROUTER_URL}/models`);
    const { data } = await response.json();
    expect(data[0].id).toBe(MOCK_MODEL);
  });

  it("responde chat completion sem stream com mensagem e usage", async () => {
    const response = await chat({ model: "anthropic/claude", messages: [] });
    const body = await response.json();
    expect(body.model).toBe("anthropic/claude");
    expect(body.choices[0].message.content).toBe(MOCK_REPLY);
    expect(body.usage).toEqual(MOCK_USAGE);
  });

  it("transmite SSE em chunks que remontam a resposta e terminam em [DONE]", async () => {
    const response = await chat({ messages: [], stream: true });
    expect(response.headers.get("content-type")).toBe("text/event-stream");

    const events = await readEvents(response);
    expect(events.at(-1)).toBe("[DONE]");

    const chunks = events.slice(0, -1).map((data) => JSON.parse(data));
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks[0].choices[0].delta.role).toBe("assistant");
    const content = chunks.map((chunk) => chunk.choices[0].delta.content ?? "").join("");
    expect(content).toBe(MOCK_REPLY);
    expect(chunks.at(-1)).toMatchObject({
      choices: [{ finish_reason: "stop" }],
      usage: MOCK_USAGE,
    });
  });

  it("trata corpo que não é JSON como pedido vazio", async () => {
    const response = await fetch(`${OPENROUTER_URL}/chat/completions`, {
      method: "POST",
      body: "não é json",
    });
    expect(response.status).toBe(200);
    expect((await response.json()).model).toBe(MOCK_MODEL);
  });

  it("aceita override por teste com server.use", async () => {
    server.use(
      http.post(`${OPENROUTER_URL}/chat/completions`, () =>
        HttpResponse.json({ error: { code: 429, message: "rate limited" } }, { status: 429 }),
      ),
    );
    const response = await chat({ messages: [] });
    expect(response.status).toBe(429);
  });

  it("o override não vaza para o teste seguinte", async () => {
    expect((await chat({ messages: [] })).status).toBe(200);
  });
});
