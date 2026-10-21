import type { ChatMessage, MessageRole } from "../../../../src/types/domain.ts";
import { datedFileName, downloadFile } from "../lib/download.ts";
import { DEFAULT_LOCALE, EMPTY, formatDuration, formatNumber } from "../lib/format.ts";
import { redactor } from "../lib/redact.ts";

export type ExportFormat = "markdown" | "json";
/** `timeZone` fixa o fuso dos horários do Markdown (teste); sem ele vale o do navegador. */
export type ExportOptions = { now: Date; timeZone?: string };

const ROLES: Record<MessageRole, string> = {
  system: "Sistema",
  user: "Usuário",
  assistant: "Assistente",
  tool: "Ferramenta",
};

const isoTime = (ms: number) => {
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

function summary(messages: readonly ChatMessage[]) {
  const times = messages.map((m) => m.timestamp).filter((ms) => isoTime(ms) !== null);
  const tokens = messages
    .map((m) => m.metadata?.totalTokens ?? Number.NaN)
    .filter((n) => Number.isFinite(n) && n >= 0);
  return {
    messages: messages.length,
    models: [...new Set(messages.flatMap((m) => (m.metadata?.model ? [m.metadata.model] : [])))],
    startedAt: times.length ? isoTime(times.reduce((a, b) => Math.min(a, b))) : null,
    endedAt: times.length ? isoTime(times.reduce((a, b) => Math.max(a, b))) : null,
    // Nenhuma mensagem com uso informado = total desconhecido (null), não zero.
    totalTokens: tokens.length ? tokens.reduce((a, b) => a + b, 0) : null,
    cachedResponses: messages.filter((m) => m.metadata?.cached === true).length,
  };
}

/** Registro fiel do contrato `ChatMessage`: só os campos dele (nada da config do app) e sem chave. */
export function chatToJson(messages: readonly ChatMessage[], { now }: ExportOptions) {
  const { redact, count } = redactor();
  const records = messages.map(
    ({ id, role, content, timestamp, toolCalls, toolCallId, metadata }) => ({
      id,
      role,
      content: redact(content),
      timestamp,
      time: isoTime(timestamp),
      toolCalls: toolCalls?.map(({ id, type, function: { name, arguments: args } }) => ({
        id,
        type,
        function: { name, arguments: redact(args) },
      })),
      toolCallId,
      metadata: metadata && {
        model: metadata.model,
        cached: metadata.cached,
        ttftMs: metadata.ttftMs,
        totalTokens: metadata.totalTokens,
      },
    }),
  );
  const file = {
    format: "agent-studio.chat",
    version: 1,
    exportedAt: isoTime(now.getTime()),
    summary: { ...summary(messages), redactedSecrets: count() },
    messages: records,
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** Valor numa linha só: quebra de linha num modelo ou id abriria um bloco novo no arquivo. */
const inline = (text: string) => text.replace(/\p{Cc}+/gu, " ");

/**
 * Toda linha vira citação. Pelo CommonMark, cerca de código, HTML ou lista aberta dentro dela
 * termina junto: o conteúdo não engole a mensagem seguinte nem forja um título de papel. CR solto
 * também é fim de linha no CommonMark, então entra na quebra.
 */
const quote = (text: string) =>
  text
    .split(/\r\n|\r|\n/)
    .map((line) => (line ? `> ${line}` : ">"))
    .join("\n");

/** Cerca mais longa que qualquer sequência de crases do texto, para ele não fechá-la antes. */
const fence = (text: string) =>
  "`".repeat((text.match(/`+/g) ?? []).reduce((n, run) => Math.max(n, run.length + 1), 3));

/** Markdown para ler e compartilhar; o JSON é o registro fiel. */
export function chatToMarkdown(messages: readonly ChatMessage[], { now, timeZone }: ExportOptions) {
  const { redact, count } = redactor();
  const style = { dateStyle: "short", timeStyle: "long", timeZone } as const;
  const date = new Intl.DateTimeFormat(DEFAULT_LOCALE, style);
  const time = (ms: number) => (isoTime(ms) === null ? EMPTY : date.format(ms));
  const sections = messages.map((message, index) => {
    const { model, cached, ttftMs, totalTokens } = message.metadata ?? {};
    // Toda linha gerada começa com texto fixo: valor vindo do modelo nunca abre uma linha.
    const meta = [
      model && `Modelo: ${inline(model)}`,
      totalTokens !== undefined && `Tokens: ${formatNumber(totalTokens)}`,
      ttftMs !== undefined && `Primeiro token em ${formatDuration(ttftMs)}`,
      cached && "Resposta do cache semântico",
      message.toolCallId && `Resposta à chamada ${inline(message.toolCallId)}`,
    ];
    const calls = (message.toolCalls ?? []).map(({ id, function: call }) => {
      const args = redact(call.arguments);
      const mark = fence(args);
      return `Chamada de ferramenta: ${inline(call.name)} (${inline(id)})\n\n${mark}json\n${args}\n${mark}`;
    });
    const body = [redact(message.content), ...calls].filter(Boolean).join("\n\n");
    return [
      `## ${index + 1}. ${ROLES[message.role]} · ${time(message.timestamp)}`,
      meta.filter(Boolean).join(" · "),
      quote(body || "*(sem conteúdo)*"),
    ]
      .filter(Boolean)
      .join("\n\n");
  });
  const info = summary(messages);
  const header = [
    "# Conversa exportada",
    "",
    `- Exportada em: ${time(now.getTime())}`,
    `- Mensagens: ${info.messages}`,
    `- Modelos: ${info.models.map(inline).join(", ") || EMPTY}`,
    `- Tokens: ${formatNumber(info.totalTokens ?? Number.NaN)}`,
  ];
  if (count()) header.push(`- Chaves de API removidas: ${count()}`);
  return `${[header.join("\n"), ...sections].join("\n\n")}\n`;
}

/** Baixa a conversa como `conversa-AAAA-MM-DD.md` ou `.json`. */
export function saveChat(
  messages: readonly ChatMessage[],
  format: ExportFormat,
  options: ExportOptions,
) {
  const name = (extension: string) => datedFileName("conversa", extension, options.now);
  if (format === "json") {
    downloadFile(name("json"), chatToJson(messages, options), "application/json");
  } else {
    downloadFile(name("md"), chatToMarkdown(messages, options), "text/markdown;charset=utf-8");
  }
}
