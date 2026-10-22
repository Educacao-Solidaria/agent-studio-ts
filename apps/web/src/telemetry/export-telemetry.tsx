import { ExportButtons } from "../components/export-buttons.tsx";
import { retryImport } from "../lib/retry-import.ts";
import type { PerfSample } from "./perf-samples.ts";
import type { TelemetryFormat } from "./telemetry-file.ts";

type TelemetryFile = typeof import("./telemetry-file.ts");
/** O serializador vem sob demanda, no primeiro clique: fora do bundle principal. */
export const loadTelemetryFile = retryImport(
  (): Promise<TelemetryFile> => import("./telemetry-file.ts"),
);

export type ExportTelemetryProps = {
  samples: readonly PerfSample[];
  load?: () => Promise<TelemetryFile>;
};

const FORMATS: Record<TelemetryFormat, string> = { csv: "CSV", json: "JSON" };

/** Baixa o relatório de desempenho (as amostras dos gráficos) em CSV, para planilha, ou JSON. */
export function ExportTelemetry({ samples, load = loadTelemetryFile }: ExportTelemetryProps) {
  const save = async (format: TelemetryFormat) =>
    (await load()).saveTelemetry(samples, format, { now: new Date() });
  return (
    <ExportButtons
      label="Exportar relatório de desempenho"
      formats={FORMATS}
      disabled={!samples.length}
      save={save}
    />
  );
}
