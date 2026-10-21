import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { PERF_WINDOW, PerfCharts } from "./perf-charts.tsx";
import type { PerfSample } from "./perf-samples.ts";

// Valores fixos (sem Math.random): a história é a mesma a cada abertura.
const sample = (i: number): PerfSample => ({
  at: Date.UTC(2026, 9, 21, 17, 0, i * 9),
  model: "openai/gpt-4o-mini",
  ...(i === 7 ? {} : { ttftMs: 180 + ((i * 53) % 260), tps: 38 + ((i * 17) % 30) }),
  estimated: i % 5 === 0,
});

const meta = {
  title: "Telemetry/PerfCharts",
  component: PerfCharts,
  args: { samples: Array.from({ length: 24 }, (_, i) => sample(i)) },
  decorators: [(Story) => <div className="w-[40rem] max-w-full">{Story()}</div>],
  parameters: { layout: "padded" },
} satisfies Meta<typeof PerfCharts>;
export default meta;

type Story = StoryObj<typeof meta>;

/** As últimas respostas; a 8ª parou antes do primeiro token (buraco nas duas linhas). */
export const Recent: Story = {};

/** Uma resposta a cada 1,5 s: a janela anda e os pontos deslizam (sem animar com reduced-motion). */
export const Live: Story = { render: () => <LiveCharts /> };

function LiveCharts() {
  const [samples, setSamples] = useState<PerfSample[]>([]);
  useEffect(() => {
    let i = 0;
    const timer = setInterval(() => {
      const item = { ...sample(i++), at: Date.now() };
      setSamples((all) => [...all, item].slice(-PERF_WINDOW));
    }, 1500);
    return () => clearInterval(timer);
  }, []);
  return <PerfCharts samples={samples} />;
}
