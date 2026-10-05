import type { Preview } from "@storybook/react-vite";
import { applyTheme, type Theme } from "../src/lib/theme.ts";
import "../src/styles/globals.css";

const preview: Preview = {
  globalTypes: {
    theme: {
      description: "Tema dos tokens (data-theme no elemento raiz)",
      toolbar: {
        title: "Tema",
        icon: "mirror",
        dynamicTitle: true,
        items: [
          { value: "light", title: "Claro" },
          { value: "dark", title: "Escuro" },
          { value: "system", title: "Sistema" },
        ],
      },
    },
  },
  initialGlobals: { theme: "light" },
  decorators: [
    (Story, { globals }) => {
      // Mesmo caminho do app: o tema é só o data-theme do <html>, os tokens fazem o resto.
      applyTheme((globals.theme ?? "light") as Theme);
      return <Story />;
    },
  ],
  parameters: { layout: "centered" },
};

export default preview;
