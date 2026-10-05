import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "./badge.tsx";

const meta = {
  title: "ui/Badge",
  component: Badge,
  args: { children: "rodando" },
  argTypes: {
    variant: {
      control: "inline-radio",
      options: ["neutral", "primary", "success", "warning", "danger"],
    },
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Neutral: Story = {};
export const AllVariants: Story = {
  render: () => (
    <div className="flex gap-2">
      <Badge>rascunho</Badge>
      <Badge variant="primary">ativo</Badge>
      <Badge variant="success">concluído</Badge>
      <Badge variant="warning">lento</Badge>
      <Badge variant="danger">falhou</Badge>
    </div>
  ),
};
