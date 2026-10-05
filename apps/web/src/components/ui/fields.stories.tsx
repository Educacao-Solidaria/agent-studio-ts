import type { Meta, StoryObj } from "@storybook/react-vite";
import { Input } from "./input.tsx";
import { Textarea } from "./textarea.tsx";

const meta = {
  title: "ui/Fields",
  component: Input,
  args: { "aria-label": "Nome do agente", placeholder: "ex.: triagem" },
  decorators: [(Story) => <div className="w-80">{Story()}</div>],
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TextInput: Story = {};
export const Invalid: Story = { args: { "aria-invalid": true, defaultValue: "nome com espaço" } };
export const Disabled: Story = { args: { disabled: true, defaultValue: "somente leitura" } };
export const Multiline: Story = {
  render: () => (
    <Textarea aria-label="Prompt do sistema" placeholder="Você é um agente de triagem…" />
  ),
};
