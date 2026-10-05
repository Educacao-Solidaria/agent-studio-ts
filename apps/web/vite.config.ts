import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig(({ command, mode }) => ({
  plugins: [react(), tailwindcss()],
  // O mockServiceWorker.js (gerado por `msw init`) só é servido no `pnpm dev:mock`;
  // nenhum build o copia para dist. ponytail: se o app ganhar um public/ de verdade,
  // o modo mock continua apontando para public-dev — junte os dois se precisar de ambos.
  publicDir: command === "serve" && mode === "mock" ? "public-dev" : "public",
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test/setup.ts"],
  },
}));
