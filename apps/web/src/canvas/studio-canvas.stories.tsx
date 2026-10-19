import type { Meta, StoryObj } from "@storybook/react-vite";
import { sampleEdges, sampleNodes } from "./sample-flow.ts";
import { StudioCanvas } from "./studio-canvas.tsx";

const meta = {
  title: "canvas/StudioCanvas",
  component: StudioCanvas,
  parameters: { layout: "fullscreen" },
  args: { className: "h-dvh", initialNodes: sampleNodes, initialEdges: sampleEdges },
} satisfies Meta<typeof StudioCanvas>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SampleFlow: Story = {};
export const Empty: Story = { args: { initialNodes: [], initialEdges: [] } };
