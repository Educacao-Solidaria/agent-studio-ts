import type { Meta, StoryObj } from "@storybook/react-vite";
import { OfflineBanner } from "./offline-banner.tsx";

const services = [
  { name: "Gateway", url: "/health/gateway" },
  { name: "RAG", url: "/health/rag" },
];

const meta = {
  title: "ui/OfflineBanner",
  component: OfflineBanner,
  // Saúde simulada: nada sai da página. O RAG nunca responde.
  args: { services, baseDelayMs: 500, check: async (url: string) => url !== "/health/rag" },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof OfflineBanner>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Duas falhas seguidas do RAG (cerca de 1 s) e a faixa avisa; segue tentando com espera crescente. */
export const ServiceDown: Story = {};

/** Tudo de pé: a região do leitor de tela fica montada e vazia, sem ocupar espaço. */
export const AllUp: Story = { args: { check: async () => true } };
