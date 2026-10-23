import { defineConfig, devices } from "@playwright/test";

// Smoke do build do GitHub Pages (job `build` do deploy.yml), sobre o `dist` já construído com
// `pnpm build --base "$PAGES_BASE"`. Sem servidor: a spec responde aos pedidos pelo page.route.
export default defineConfig({
  testDir: "e2e/pages",
  forbidOnly: true,
  reporter: [["list"]],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
