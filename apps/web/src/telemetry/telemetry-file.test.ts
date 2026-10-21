import { describe, expect, it, vi } from "vitest";
import { downloadFile } from "../lib/download.ts";
import { REDACTED } from "../lib/redact.ts";
import type { PerfSample } from "./perf-samples.ts";
import { saveTelemetry, telemetryToCsv, telemetryToJson, textCell } from "./telemetry-file.ts";

vi.mock("../lib/download.ts", async (original) => ({
  ...(await original<typeof import("../lib/download.ts")>()),
  downloadFile: vi.fn(),
}));

const at = Date.UTC(2026, 9, 21, 15, 4, 5);
const sample = (extra?: Partial<PerfSample>): PerfSample => ({
  ...{ at, model: "openai/gpt-4o-mini", ttftMs: 412, tps: 38.46, estimated: false },
  ...{ cached: false, ...extra },
});
const rows = (csv: string) => csv.slice(1).split("\r\n"); // sem o BOM
const KEY = "sk-or-v1-0123456789abcdefghijklmn";

describe("telemetryToCsv", () => {
  it("BOM UTF-8, ';', vírgula decimal, vazio sem medida e CRLF", () => {
    const unknown = { ttftMs: undefined, tps: undefined, estimated: true, cached: undefined };
    const csv = telemetryToCsv([sample(), sample(unknown), sample({ cached: true })]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(rows(csv)).toEqual([
      "Data e hora (UTC);Modelo;TTFT (ms);Tokens/s;Estimado;Cache",
      '2026-10-21 15:04:05;"openai/gpt-4o-mini";412;38,5;não;miss',
      '2026-10-21 15:04:05;"openai/gpt-4o-mini";;;sim;',
      '2026-10-21 15:04:05;"openai/gpt-4o-mini";412;38,5;não;hit',
      "", // termina em CRLF
    ]);
    expect(telemetryToCsv([])).toBe(
      "\uFEFFData e hora (UTC);Modelo;TTFT (ms);Tokens/s;Estimado;Cache\r\n",
    );
  });

  const formulas = ["=1+1", "+1", "-1+1", "@SUM(A1)", "\t=1", "\r=1"];
  const wide = ["\uFF1D1+1", "\uFF0B1", "\uFF0D1+1", "\uFF20SUM(A1)"]; // largura total
  it.each([...formulas, ...wide])("%j vira texto", (model) => {
    expect(rows(telemetryToCsv([sample({ model })]))[1]?.split(";")[1]).toBe(`"'${model}"`);
  });

  it("aspas, separador e quebra ficam dentro da célula; chave não sai", () => {
    expect(textCell('a"b;c\nd')).toBe('"a""b;c\nd"');
    expect(textCell(" =1")).toBe('" =1"'); // espaço na frente: a planilha não avalia
    expect(telemetryToCsv([sample({ model: `meu ${KEY}` })])).toContain(`"meu ${REDACTED}"`);
  });
});

describe("telemetryToJson", () => {
  it("metadados, resumo e só os campos da amostra, sem chave", () => {
    const extra = { ...sample({ model: KEY }), apiKey: "segredo" } as PerfSample;
    // Fora de ordem de propósito: início e fim são o menor e o maior horário, não o 1º e o último.
    const late = sample({ ttftMs: 300, tps: 40, at: at + 60_000 });
    const list = [late, sample({ ttftMs: 100, cached: true, at: at - 60_000 }), extra];
    const file = JSON.parse(telemetryToJson(list, { now: new Date(at) }));
    expect(file).toMatchObject({
      format: "agent-studio/performance",
      version: 1,
      redactedSecrets: 1,
    });
    expect(file.exportedAt).toBe("2026-10-21T15:04:05.000Z");
    expect(file.summary).toEqual({
      ...{ responses: 3, startedAt: "2026-10-21T15:03:05.000Z" },
      ...{ endedAt: "2026-10-21T15:05:05.000Z", ttftP50Ms: 300, ttftP95Ms: 412 },
      ...{ percentileMethod: "nearest-rank", tokensPerSecondMean: (40 + 38.46 + 38.46) / 3 },
      ...{ cacheHits: 1, cacheMisses: 2 },
    });
    expect(file.responses[2]).toEqual({
      ...{ at: file.exportedAt, model: REDACTED, ttftMs: 412, tokensPerSecond: 38.46 },
      ...{ estimated: false, cache: "miss" },
    });
    expect(JSON.stringify(file)).not.toContain("segredo");
  });

  it("percentil pelo posto ⌈q·n⌉, em ordem numérica", () => {
    const ranks = (n: number) => {
      const list = Array.from({ length: n }, (_, i) => sample({ ttftMs: (n - i) * 100 }));
      const { summary } = JSON.parse(telemetryToJson(list, { now: new Date(at) }));
      return [summary.ttftP50Ms, summary.ttftP95Ms];
    };
    // Em 4, o p50 é o 2º (200), não a média 250; em 11, o p95 é o 11º (⌈10,45⌉), não o 10º.
    expect([ranks(4), ranks(11)]).toEqual([
      [200, 400],
      [600, 1100],
    ]);
  });

  it("lista vazia: resumo sem número inventado", () => {
    const { summary } = JSON.parse(telemetryToJson([], { now: new Date(at) }));
    expect(summary).toMatchObject({ responses: 0, startedAt: null, ttftP50Ms: null });
    expect(summary.tokensPerSecondMean).toBeNull();
  });
});

it("NaN, infinito, horário inválido e cache desconhecido: vazio, sem virar número nem hit", () => {
  const broken = sample({ at: Number.NaN, ttftMs: Number.NaN, tps: Number.POSITIVE_INFINITY });
  expect(rows(telemetryToCsv([broken]))[1]).toBe(';"openai/gpt-4o-mini";;;não;miss');
  const list = [broken, sample({ cached: undefined })];
  const file = JSON.parse(telemetryToJson(list, { now: new Date(at) }));
  expect(file.responses[0]).toMatchObject({ at: null, ttftMs: null, tokensPerSecond: null });
  expect(file.summary).toMatchObject({ startedAt: file.exportedAt, ttftP50Ms: 412 });
  expect(file.summary).toMatchObject({ cacheHits: 0, cacheMisses: 1 });
  expect(file.summary.tokensPerSecondMean).toBe(38.46);
});

it("baixa desempenho-AAAA-MM-DD na data local, com o tipo de cada formato", () => {
  const now = new Date(2026, 9, 21, 23, 30);
  saveTelemetry([sample()], "csv", { now });
  const csv = [
    "desempenho-2026-10-21.csv",
    expect.stringMatching(/^\uFEFF/),
    "text/csv;charset=utf-8",
  ];
  expect(downloadFile).toHaveBeenLastCalledWith(...csv);
  saveTelemetry([sample()], "json", { now });
  const json = expect.stringContaining('"format": "agent-studio/performance"');
  expect(downloadFile).toHaveBeenLastCalledWith(
    "desempenho-2026-10-21.json",
    json,
    "application/json",
  );
});
