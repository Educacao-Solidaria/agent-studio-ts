import type { Meta, StoryObj } from "@storybook/react-vite";
import { TtftIndicator } from "./ttft.tsx";

const meta = {
  title: "Chat/TtftIndicator",
  component: TtftIndicator,
  args: { state: { status: "done", ms: 412 } },
} satisfies Meta<typeof TtftIndicator>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Enviado agora, sem token ainda: o cronômetro conta a cada quadro. */
export const Waiting: Story = { args: { state: { status: "waiting", since: performance.now() } } };

/** Chegou o primeiro token: o valor fica. */
export const Measured: Story = {};

/** Parada (ou erro) antes do primeiro token: sem número. */
export const Stopped: Story = { args: { state: { status: "stopped" } } };
