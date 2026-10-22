import { composeStories, setProjectAnnotations } from "@storybook/react-vite";
import type { FC } from "react";
import { createRoot, type Root } from "react-dom/client";
import preview from "../.storybook/preview.tsx";

/** O catálogo inteiro numa página, para o teste de acessibilidade rodar no Chromium (o jsdom não
 * calcula contraste). O tema vem da URL (`?theme=dark`) pelo mesmo caminho do Storybook: o global
 * `theme`, que o decorator do preview aplica no `data-theme` do `<html>`. */
const theme = new URLSearchParams(location.search).get("theme") ?? "light";
setProjectAnnotations([preview, { initialGlobals: { theme } }]);

const modules = import.meta.glob<Parameters<typeof composeStories>[0]>("../src/**/*.stories.tsx", {
  eager: true,
});
const stories = new Map<string, FC>();
for (const [file, mod] of Object.entries(modules)) {
  for (const [name, Story] of Object.entries(composeStories(mod) as Record<string, FC>)) {
    stories.set(`${file.replace("../src/", "")} › ${name}`, Story);
  }
}

const container = document.getElementById("root") as HTMLElement;
let root: Root | undefined;
/** Desmonta a anterior (efeitos e portais vão junto) e monta a pedida. */
function showStory(id: string) {
  const Story = stories.get(id);
  if (!Story) throw new Error(`story desconhecida: ${id}`);
  root?.unmount();
  root = createRoot(container);
  root.render(<Story />);
}

Object.assign(window, { storyIds: [...stories.keys()], showStory });
