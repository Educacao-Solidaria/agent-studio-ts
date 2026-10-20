import type { Meta, StoryObj } from "@storybook/react-vite";
import { TokenCounter } from "./token-counter.tsx";

// Preço injetado (o do seletor de modelos): a história não depende da rede.
const pricing = { prompt: 0.000003, completion: 0.000015, contextLength: 200_000 };

const meta = {
  title: "Chat/TokenCounter",
  component: TokenCounter,
  args: { model: "anthropic/claude-sonnet", pricing, prompt: "Resuma o documento. ".repeat(300) },
} satisfies Meta<typeof TokenCounter>;
export default meta;

type Story = StoryObj<typeof meta>;

/** O stream ainda chegando: tudo contado pelo texto, com "≈" e o rótulo. */
export const Estimating: Story = { args: { completion: "Aqui está o resumo pedido. ".repeat(40) } };

/** O gateway mandou o `metadata`: números reais. */
export const Final: Story = {
  args: { usage: { prompt_tokens: 1534, completion_tokens: 412, cached: false } },
};

/** Resposta do cache semântico: tokens reais, sem custo. */
export const FromCache: Story = {
  args: { usage: { prompt_tokens: 1534, completion_tokens: 412, cached: true } },
};
