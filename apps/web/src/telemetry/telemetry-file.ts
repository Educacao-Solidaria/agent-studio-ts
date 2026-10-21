import { datedFileName, downloadFile } from "../lib/download.ts";
import { redactor } from "../lib/redact.ts";
import type { PerfSample } from "./perf-samples.ts";

export type TelemetryFormat = "csv" | "json";

// O Excel em pt-BR separa por ";" e lê vírgula decimal: assim o arquivo abre em colunas, com
// números de verdade, no clique duplo. Quem processa por programa usa o JSON.
const SEP = ";";
// O Excel e o LibreOffice avaliam a célula que começa assim — mesmo entre aspas (CSV injection).
// O Numbers da Apple normaliza `=`, `+`, `-` e `@` de largura total (U+FF1D, U+FF0B, U+FF0D,
// U+FF20) para os comuns: entram também, como no `escape_formulas` do csv-stringify.
const FORMULA = /^[=+\-@\t\r\uFF1D\uFF0B\uFF0D\uFF20]/;

// Planilha com outro separador (o Excel em inglês usa a vírgula) não vê as aspas no meio da linha:
// `,`, `;`, tab ou quebra dentro do texto abrem célula ou linha nova, que pode começar com fórmula
// (provado no LibreOffice). Mesma classe do FORMULA, depois de um desses.
const INNER = new RegExp(`([,;\\t\\r\\n])(?=${FORMULA.source.slice(1)})`, "g");

/** Célula de texto: sempre entre aspas (pode ter `;`, aspas, quebra de linha) e um apóstrofo, que
 * a planilha mostra como texto, antes de todo começo de fórmula: no início e depois de separador
 * ou quebra (receita da OWASP). */
export function textCell(value: string) {
  const safe = (FORMULA.test(value) ? `'${value}` : value).replace(INNER, "$1'");
  return `"${safe.replaceAll('"', '""')}"`;
}

const decimal = (value: number | undefined, digits: number) =>
  value === undefined || !Number.isFinite(value) ? "" : value.toFixed(digits).replace(".", ",");
const iso = (ms: number) => {
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
function cacheOf(cached?: boolean) {
  if (cached === undefined) return null; // sem `metadata`: não se sabe
  return cached ? "hit" : "miss";
}

/** CSV para planilha: BOM UTF-8 (sem ele o Excel lê os acentos como Latin-1) e linhas em CRLF. */
export function telemetryToCsv(samples: readonly PerfSample[]) {
  const { redact } = redactor();
  const header = ["Data e hora (UTC)", "Modelo", "TTFT (ms)", "Tokens/s", "Estimado", "Cache"];
  const rows = samples.map((s) =>
    [
      iso(s.at)?.replace("T", " ").slice(0, 19) ?? "", // "AAAA-MM-DD HH:MM:SS": a planilha lê como data
      textCell(redact(s.model)),
      decimal(s.ttftMs, 0),
      decimal(s.tps, 1),
      s.estimated ? "sim" : "não",
      cacheOf(s.cached) ?? "",
    ].join(SEP),
  );
  return `\uFEFF${[header.join(SEP), ...rows].join("\r\n")}\r\n`;
}

/** Posto mais próximo (nearest-rank) de uma lista ordenada; vazia = sem número. */
const rank = (sorted: number[], q: number) => sorted[Math.ceil(q * sorted.length) - 1] ?? null;
const finite = (values: (number | undefined)[]) =>
  values.filter((value): value is number => value !== undefined && Number.isFinite(value));

/** JSON com metadados e resumo; só os campos da amostra (campo a mais no objeto não entra) e sem chave. */
export function telemetryToJson(samples: readonly PerfSample[], { now }: { now: Date }) {
  const { redact, count } = redactor();
  const responses = samples.map(({ at, model, ttftMs, tps, estimated, cached }) => ({
    at: iso(at),
    model: redact(model),
    ttftMs: ttftMs ?? null,
    tokensPerSecond: tps ?? null,
    estimated,
    cache: cacheOf(cached),
  }));
  const times = finite(samples.map((s) => s.at));
  const ttft = finite(samples.map((s) => s.ttftMs)).sort((a, b) => a - b);
  const tps = finite(samples.map((s) => s.tps));
  const summary = {
    responses: samples.length,
    startedAt: times.length ? iso(times.reduce((a, b) => Math.min(a, b))) : null,
    endedAt: times.length ? iso(times.reduce((a, b) => Math.max(a, b))) : null,
    // Sem interpolar: o percentil é o TTFT de uma resposta real. Numa lista par o p50 é o do meio
    // de baixo, não a média dos dois (a MED da planilha): o arquivo diz o método.
    ttftP50Ms: rank(ttft, 0.5),
    ttftP95Ms: rank(ttft, 0.95),
    percentileMethod: "nearest-rank",
    // Sem resposta com taxa = média desconhecida (null), não zero.
    tokensPerSecondMean: tps.length ? tps.reduce((a, b) => a + b, 0) / tps.length : null,
    cacheHits: responses.filter((r) => r.cache === "hit").length,
    cacheMisses: responses.filter((r) => r.cache === "miss").length,
  };
  const file = { format: "agent-studio/performance", version: 1, exportedAt: now.toISOString() };
  return JSON.stringify({ ...file, summary, redactedSecrets: count(), responses }, null, 2);
}

/** Baixa `desempenho-AAAA-MM-DD.csv|json`; o nome não carrega nada da sessão. */
export function saveTelemetry(
  samples: readonly PerfSample[],
  format: TelemetryFormat,
  { now }: { now: Date },
) {
  const csv = format === "csv";
  const content = csv ? telemetryToCsv(samples) : telemetryToJson(samples, { now });
  const type = csv ? "text/csv;charset=utf-8" : "application/json";
  downloadFile(datedFileName("desempenho", format, now), content, type);
}
