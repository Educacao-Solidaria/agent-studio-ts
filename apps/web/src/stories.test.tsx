import { composeStories, setProjectAnnotations } from "@storybook/react-vite";
import { render } from "@testing-library/react";
import type { FC } from "react";
import { describe, expect, it } from "vitest";
import preview from "../.storybook/preview.tsx";
import * as buttonStories from "./components/ui/button.stories.tsx";

// Aplica os decorators globais (tema) como o Storybook faria.
setProjectAnnotations(preview);

// Toda story do catálogo precisa renderizar sem erro: quebrar um componente quebra o teste.
const modules = import.meta.glob<Parameters<typeof composeStories>[0]>("./**/*.stories.tsx", {
  eager: true,
});

describe("stories", () => {
  it("encontra os arquivos do catálogo", () => {
    expect(Object.keys(modules).length).toBeGreaterThanOrEqual(5);
  });

  it("aplica o tema claro por padrão via data-theme", () => {
    const { Primary } = composeStories(buttonStories);
    delete document.documentElement.dataset.theme;
    render(<Primary />);
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  for (const [file, mod] of Object.entries(modules)) {
    const stories = composeStories(mod) as Record<string, FC>;
    for (const [name, Story] of Object.entries(stories)) {
      it(`${file} › ${name}`, () => {
        const { container } = render(<Story />);
        expect(container.firstChild).not.toBeNull();
      });
    }
  }
});
