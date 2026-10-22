import type { Meta, StoryObj } from "@storybook/react-vite";
import { CodeBlock } from "./code-block.tsx";

// As seis cores do destaque (comentário, palavra-chave, texto, constante, função e tipo) e uma
// linha que passa da largura: o bloco rola na horizontal.
const code = `// procura no cache semântico antes de chamar o modelo
export async function lookup(prompt: string, limit = 3): Promise<Hit[]> {
  const hits = await cache.search({ prompt, limit, threshold: 0.92, exact: false, source: "chat" });
  return hits.filter((hit) => hit.score > 0.8);
}`;

const meta = {
  title: "Chat/CodeBlock",
  component: CodeBlock,
  args: { code, lang: "ts", className: "w-96" },
} satisfies Meta<typeof CodeBlock>;
export default meta;

type Story = StoryObj<typeof meta>;

/** TypeScript com destaque: o Shiki chega sob demanda e colore o texto que já estava na tela. */
export const Highlighted: Story = {};

/** Linguagem fora da lista: texto puro, sem baixar o Shiki. */
export const PlainText: Story = { args: { lang: "txt" } };
