import type { Meta, StoryObj } from "@storybook/react-vite";
import { ExportChat } from "./export-chat.tsx";

const start = Date.UTC(2026, 9, 20, 16, 58);

const meta = {
  title: "Chat/ExportChat",
  component: ExportChat,
  args: {
    messages: [
      { id: "1", role: "user", content: "Liste os arquivos com um comando.", timestamp: start },
      {
        id: "2",
        role: "assistant",
        content: "Use:\n\n```sh\nls -la\n```",
        timestamp: start + 2_400,
        metadata: { model: "openai/gpt-4o", totalTokens: 86, ttftMs: 420, cached: false },
      },
    ],
  },
} satisfies Meta<typeof ExportChat>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Clique e confira o arquivo baixado (.md para ler, .json para auditoria). */
export const Conversation: Story = {};

/** Nada a exportar: os botões ficam desligados. */
export const Empty: Story = { args: { messages: [] } };
