import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { AutoScroll } from "./auto-scroll.tsx";
import { VirtualMessages } from "./virtual-messages.tsx";

type Message = { id: string; text: string };
const WORDS = "o fluxo chama o gateway que consulta o cache e o rag antes do modelo".split(" ");
// Tamanhos de 4 a 63 palavras: alturas bem diferentes, como numa conversa de verdade.
const message = (i: number): Message => ({
  id: `m${i}`,
  text: `${i + 1}. ${Array.from({ length: 4 + ((i * 7) % 60) }, (_, j) => WORDS[(i + j) % WORDS.length]).join(" ")}`,
});
const MANY = Array.from({ length: 5_000 }, (_, i) => message(i));
const bubble = (m: Message) => (
  <p className="m-2 rounded-md border border-border bg-surface p-3 text-sm">{m.text}</p>
);

/** `virtual: false` mostra a mesma lista inteira no DOM (para comparar; não é uma história). */
type DemoProps = { count: number; streaming?: boolean; virtual?: boolean };
function Demo({ count, streaming = false, virtual = true }: DemoProps) {
  const [items, setItems] = useState(() => MANY.slice(0, count));
  useEffect(() => {
    if (!streaming) return;
    // A última mensagem cresce como texto chegando do modelo.
    const timer = setInterval(() => {
      setItems((list) => {
        const last = list.at(-1);
        return last ? [...list.slice(0, -1), { ...last, text: `${last.text} mais` }] : list;
      });
    }, 60);
    return () => clearInterval(timer);
  }, [streaming]);
  const className = "h-[480px] rounded-md border border-border";
  if (!virtual)
    return (
      <AutoScroll className={className}>
        {items.map((m) => (
          <div key={m.id}>{bubble(m)}</div>
        ))}
      </AutoScroll>
    );
  return (
    <VirtualMessages items={items} getKey={(m) => m.id} className={className}>
      {bubble}
    </VirtualMessages>
  );
}

const meta = {
  title: "Chat/VirtualMessages",
  component: Demo,
  args: { count: 5_000, virtual: true },
} satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Cinco mil mensagens: só as perto da tela ficam no DOM. */
export const Thousands: Story = {};

/** A última mensagem crescendo: o fim acompanha; suba para ver o botão "Novas mensagens". */
export const Streaming: Story = { args: { count: 200, streaming: true } };
