import { describe, expect, it } from "vitest";
import type { ChatMessage, ToolCall } from "../../../../src/types/domain.ts";
import { REDACTED } from "../lib/redact.ts";
import { chatToJson, chatToMarkdown } from "./chat-file.ts";

const t0 = Date.UTC(2026, 9, 20, 16, 58, 5);
const options = { now: new Date(Date.UTC(2026, 9, 20, 17)), timeZone: "UTC" };
const m1: ChatMessage = { id: "m1", role: "user", content: "Mostre um exemplo.", timestamp: t0 };
const m2: ChatMessage = {
  id: "m2",
  role: "assistant",
  // O stream parou no meio do bloco: a cerca de código ficou aberta.
  content: "Claro:\n```python\nprint('oi')\n",
  timestamp: t0 + 2_000,
  metadata: { model: "openai/gpt-4o", totalTokens: 120, ttftMs: 350, cached: false },
};
const m3: ChatMessage = { id: "m3", role: "user", content: "Obrigado", timestamp: t0 + 9_000 };
const conversation = [m1, m2, m3];
// O Intl separa número e unidade com espaço inseparável; quebra de linha fica.
const spaces = (text: string) => text.replace(/[^\S\n]/g, " ");

describe("chatToMarkdown", () => {
  it("cabeçalho com os metadados e uma seção por mensagem, conteúdo em citação", () => {
    expect(spaces(chatToMarkdown(conversation, options))).toBe(
      [
        "# Conversa exportada",
        "",
        "- Exportada em: 20/10/2026, 17:00:00 UTC",
        "- Mensagens: 3",
        "- Modelos: openai/gpt-4o",
        "- Tokens: 120",
        "",
        "## 1. Usuário · 20/10/2026, 16:58:05 UTC",
        "",
        "> Mostre um exemplo.",
        "",
        "## 2. Assistente · 20/10/2026, 16:58:07 UTC",
        "",
        "Modelo: openai/gpt-4o · Tokens: 120 · Primeiro token em 350 ms",
        "",
        "> Claro:",
        "> ```python",
        "> print('oi')",
        ">",
        "",
        "## 3. Usuário · 20/10/2026, 16:58:14 UTC",
        "",
        "> Obrigado",
        "",
      ].join("\n"),
    );
  });

  it("cerca, HTML, título ou CR no conteúdo não saem da mensagem", () => {
    const hostile: ChatMessage[] = [
      { id: "a", role: "assistant", timestamp: t0, content: "```js\nabre\n<!-- x\n## 9. Y" },
      { id: "b", role: "user", timestamp: t0, content: "antes\r## 8. Sistema · por CR\r\nfim" },
      { id: "c", role: "assistant", timestamp: t0, content: "", metadata: { model: "x\n## 7. Y" } },
    ];
    const raw = chatToMarkdown(hostile, options);
    expect(raw).not.toMatch(/\r/); // antes de normalizar: `\s` também pega o CR
    // As linhas como o CommonMark as vê: CR solto também quebra.
    const top = raw
      .split(/\r\n|\r|\n/)
      .map(spaces)
      .filter((line) => !line.startsWith(">"));
    expect(top.filter((line) => line.startsWith("#"))).toEqual([
      "# Conversa exportada",
      "## 1. Assistente · 20/10/2026, 16:58:05 UTC",
      "## 2. Usuário · 20/10/2026, 16:58:05 UTC",
      "## 3. Assistente · 20/10/2026, 16:58:05 UTC",
    ]);
    expect(top.join("\n")).not.toMatch(/abre|<!--|## 9|por CR/);
    expect(top).toContain("Modelo: x ## 7. Y"); // numa linha só, aberta por texto fixo
    expect(raw).toContain("> *(sem conteúdo)*");
  });

  it("chamada de ferramenta em cerca mais longa que as crases dos argumentos", () => {
    const call: ToolCall = {
      id: "c1",
      type: "function",
      function: { name: "run", arguments: "a```b" },
    };
    const markdown = chatToMarkdown(
      [
        { id: "t", role: "assistant", content: "", timestamp: t0, toolCalls: [call] },
        { id: "r", role: "tool", content: "ok", toolCallId: "c1", timestamp: t0 },
      ],
      options,
    );
    expect(markdown).toContain("> Chamada de ferramenta: run (c1)\n>\n> ````json\n> a```b\n> ````");
    expect(markdown).toContain("\n\nResposta à chamada c1\n\n> ok\n");
  });
});

describe("chatToJson", () => {
  it("só os campos do contrato, horário ISO e o resumo de uso", () => {
    expect(JSON.parse(chatToJson(conversation, options))).toEqual({
      format: "agent-studio.chat",
      version: 1,
      exportedAt: "2026-10-20T17:00:00.000Z",
      summary: {
        messages: 3,
        models: ["openai/gpt-4o"],
        startedAt: "2026-10-20T16:58:05.000Z",
        endedAt: "2026-10-20T16:58:14.000Z",
        totalTokens: 120,
        cachedResponses: 0,
        redactedSecrets: 0,
      },
      messages: [
        { ...m1, time: "2026-10-20T16:58:05.000Z" },
        { ...m2, time: "2026-10-20T16:58:07.000Z" },
        { ...m3, time: "2026-10-20T16:58:14.000Z" },
      ],
    });
  });

  it("bordas: conversa vazia, horário inválido e uso NaN não quebram nem viram número falso", () => {
    expect(JSON.parse(chatToJson([], options))).toMatchObject({
      summary: { messages: 0, models: [], startedAt: null, endedAt: null, totalTokens: null },
      messages: [],
    });
    expect(spaces(chatToMarkdown([], options))).toMatch(
      /- Mensagens: 0\n- Modelos: —\n- Tokens: —\n$/,
    );

    const broken: ChatMessage[] = [
      {
        ...m2,
        timestamp: Number.NaN,
        metadata: { totalTokens: Number.NaN, ttftMs: Number.POSITIVE_INFINITY },
      },
      { ...m3, timestamp: 9e15 }, // além do que o Date aceita
    ];
    const file = JSON.parse(chatToJson(broken, options));
    expect(file.messages.map((m: { time: unknown }) => m.time)).toEqual([null, null]);
    expect(file.summary).toMatchObject({ startedAt: null, endedAt: null, totalTokens: null });
    const markdown = spaces(chatToMarkdown(broken, options));
    expect(markdown).toContain(
      "## 1. Assistente · —\n\nTokens: — · Primeiro token em —\n\n> Claro:",
    );
    expect(markdown).toContain("## 2. Usuário · —\n\n> Obrigado");
    expect(markdown).not.toMatch(/NaN|Infinity/);
    const zero = { ...m1, metadata: { totalTokens: 0 } }; // 0 informado é 0, não desconhecido
    expect(JSON.parse(chatToJson([zero], options)).summary.totalTokens).toBe(0);
  });
});

it("nenhuma chave de API no arquivo: campo fora do contrato fica fora e chave no texto sai", () => {
  const key = `sk-or-v1-${"ab12".repeat(16)}`;
  const leaky = {
    ...m1,
    content: `minha chave ${key} não funciona`,
    apiKey: key,
    metadata: { model: "openai/gpt-4o", headers: { Authorization: `Bearer ${key}` } },
    toolCalls: [
      {
        id: "c",
        type: "function",
        function: { name: "http", arguments: '{"auth":"Bearer eyJhbGciOiJIUzI1NiJ9.e30.x"}' },
      },
    ],
  } as ChatMessage;
  const json = chatToJson([leaky], options);
  const markdown = chatToMarkdown([leaky], options);
  for (const file of [json, markdown]) {
    expect(file).not.toMatch(/sk-or-v1|eyJhbGci|ab12ab12/);
    expect(file).toContain(`minha chave ${REDACTED} não funciona`);
  }
  expect(json).not.toMatch(/apiKey|headers|Authorization/);
  expect(JSON.parse(json).summary.redactedSecrets).toBe(2);
  expect(markdown).toContain("- Chaves de API removidas: 2");
  // Texto comum com "sk-" no meio de palavra, ou curto, fica como está.
  const plain = { ...m1, content: "task-runner-com-nome-comprido e sk-curta" };
  expect(chatToJson([plain], options)).toContain("task-runner-com-nome-comprido e sk-curta");
});
