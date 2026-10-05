import type { Meta, StoryObj } from "@storybook/react-vite";
import { Icon } from "../icons.tsx";
import { Button } from "./button.tsx";

const meta = {
  title: "ui/Button",
  component: Button,
  args: { children: "Executar fluxo" },
  argTypes: {
    variant: { control: "inline-radio", options: ["primary", "secondary", "ghost", "danger"] },
    size: { control: "inline-radio", options: ["sm", "md", "lg", "icon"] },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};
export const Secondary: Story = { args: { variant: "secondary" } };
export const Ghost: Story = { args: { variant: "ghost" } };
export const Danger: Story = { args: { variant: "danger", children: "Excluir agente" } };
export const Disabled: Story = { args: { disabled: true } };
export const WithIcon: Story = {
  args: {
    children: (
      <>
        <Icon name="run" /> Executar
      </>
    ),
  },
};
export const IconOnly: Story = {
  args: { size: "icon", variant: "secondary", "aria-label": "Configurações" },
  render: (args) => (
    <Button {...args}>
      <Icon name="settings" />
    </Button>
  ),
};
export const AsLink: Story = {
  args: { asChild: true, variant: "secondary" },
  render: (args) => (
    <Button {...args}>
      <a href="#docs">Documentação</a>
    </Button>
  ),
};
