import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

// O build do Pages (`pnpm build --base "$PAGES_BASE"`) aberto como o GitHub Pages serve um site de
// projeto: só existe o que está DENTRO do base, e arquivo que falta é 404, sem o fallback para o
// index.html que o nginx e o `vite preview` fazem. Nada sai da máquina: o page.route responde a
// todo pedido do navegador, e o que vai para fora do site é abortado e anotado.
const BASE = process.env.PAGES_BASE ?? "/agent-studio-ts/";
const SITE = new URL(BASE, "https://educacao-solidaria.github.io");
const DIST = new URL("../../dist/", import.meta.url);

test("abre no subcaminho do Pages e baixa de lá os pedaços sob demanda", async ({ page }) => {
  expect(BASE, "PAGES_BASE = /<repo>/").toMatch(/^\/[\w.-]+\/$/);
  const found = { outside: [] as string[], missing: [] as string[], errors: [] as string[] };
  const clean = { outside: [], missing: [], errors: [] };
  page.on("pageerror", (error) => found.errors.push(error.message));
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== SITE.origin || !url.pathname.startsWith(BASE)) {
      found.outside.push(url.href);
      return route.abort();
    }
    const file = fileURLToPath(new URL(url.pathname.slice(BASE.length) || "index.html", DIST));
    if (statSync(file, { throwIfNoEntry: false })?.isFile()) return route.fulfill({ path: file });
    found.missing.push(url.pathname);
    return route.fulfill({ status: 404, body: "404" });
  });

  await page.goto(SITE.href);
  expect(found).toEqual(clean);
  await expect(page.getByRole("heading", { name: "Agent Studio" })).toBeVisible();
  // A paleta de nós mora num pedaço sob demanda (canvas-dialogs), baixado no 1º clique.
  await page.getByRole("button", { name: "Adicionar nó" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(found).toEqual(clean);
});
