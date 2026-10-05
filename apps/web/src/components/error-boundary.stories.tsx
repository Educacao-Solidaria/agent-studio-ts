import type { Meta, StoryObj } from "@storybook/react-vite";
import { ErrorBoundary } from "./error-boundary.tsx";

function Broken(): never {
  throw new Error("falha simulada no render");
}

const meta = {
  title: "ui/ErrorBoundary",
  component: ErrorBoundary,
  args: { children: <Broken /> },
} satisfies Meta<typeof ErrorBoundary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithDetails: Story = { args: { showDetails: true } };
export const Production: Story = { args: { showDetails: false } };
