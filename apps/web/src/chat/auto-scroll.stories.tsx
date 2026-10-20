import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { AutoScroll } from "./auto-scroll.tsx";

const WORDS = "o gateway manda mais um pedaço da resposta enquanto o modelo pensa".split(" ");

/** Uma resposta chegando palavra a palavra, como no painel: role para cima no meio dela. */
function StreamingAnswer() {
  const [words, setWords] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setWords((count) => Math.min(count + 1, 600)), 60);
    return () => clearInterval(timer);
  }, []);
  const text = Array.from({ length: words }, (_, i) => WORDS[i % WORDS.length]).join(" ");
  return <p className="whitespace-pre-wrap p-4 text-sm leading-6">{text}</p>;
}

const meta = {
  title: "Chat/AutoScroll",
  component: AutoScroll,
  args: { children: null, className: "h-72 w-96 rounded-md border" },
} satisfies Meta<typeof AutoScroll>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Streaming: Story = {
  render: (args) => (
    <AutoScroll {...args}>
      <StreamingAnswer />
    </AutoScroll>
  ),
};
