import type { Meta, StoryObj } from "@storybook/react-vite";
import { CachePie } from "./cache-pie.tsx";
import type { PerfSample } from "./perf-samples.ts";

// 19 do cache, 6 do modelo e 3 sem `metadata` (ficam fora da conta).
const sample = (i: number): PerfSample => ({
  ...{ at: Date.UTC(2026, 9, 21, 17, 0, i * 9), model: "openai/gpt-4o-mini", estimated: false },
  cached: i < 25 ? i % 4 !== 3 : undefined,
});

const meta = {
  title: "Telemetry/CachePie",
  component: CachePie,
  args: { samples: Array.from({ length: 28 }, (_, i) => sample(i)) },
  decorators: [(Story) => <div className="w-72">{Story()}</div>],
} satisfies Meta<typeof CachePie>;
export default meta;

type Story = StoryObj<typeof meta>;

/** A sessão até aqui: a legenda diz nome, porcentagem e contagem de cada fatia. */
export const Session: Story = {};

/** Nenhuma resposta com o dado de cache (o gateway não mandou `metadata`): sem pizza, sem 0/0. */
export const NoData: Story = { args: { samples: [{ at: 0, model: "m", estimated: true }] } };
