import type { StorybookConfig } from "@storybook/react-vite";

/** Catálogo isolado dos componentes de ui; reaproveita o vite.config.ts (React + Tailwind). */
const config: StorybookConfig = {
  stories: ["../src/**/*.stories.tsx"],
  framework: "@storybook/react-vite",
  // Nenhum dado do projeto sai daqui: a telemetria do Storybook fica desligada.
  core: { disableTelemetry: true },
};

export default config;
