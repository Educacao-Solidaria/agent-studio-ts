import type { Meta, StoryObj } from "@storybook/react-vite";
import { ExportTelemetry } from "./export-telemetry.tsx";
import type { PerfSample } from "./perf-samples.ts";

const sample = (i: number): PerfSample => ({
  ...{
    at: Date.UTC(2026, 9, 21, 17, 0, i * 9),
    model: "openai/gpt-4o-mini",
    estimated: i % 5 === 0,
  },
  ...{ ttftMs: 180 + ((i * 53) % 260), tps: 38 + ((i * 17) % 30) / 3, cached: i % 4 === 3 },
});

const meta = {
  title: "Telemetry/ExportTelemetry",
  component: ExportTelemetry,
  args: { samples: Array.from({ length: 12 }, (_, i) => sample(i)) },
} satisfies Meta<typeof ExportTelemetry>;
export default meta;

type Story = StoryObj<typeof meta>;

/** O relatório da sessão em CSV (planilha) ou JSON (programa). */
export const Session: Story = {};

/** Um nome de modelo com forma de fórmula: no CSV ele sai como texto, não é avaliado. */
export const FormulaLikeModel: Story = {
  args: { samples: [{ ...sample(0), model: '=HYPERLINK("https://exemplo.invalid","abrir")' }] },
};

/** Sem respostas ainda: os botões ficam desabilitados. */
export const Empty: Story = { args: { samples: [] } };
