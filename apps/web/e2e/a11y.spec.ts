import { createRequire } from "node:module";
import { expect, type Page, test } from "@playwright/test";
import { openCatalog, settle, showStory, THEMES } from "./catalog.ts";

// WCAG 2.0 e 2.1, níveis A e AA. As regras "best-practice" do axe ficam de fora de propósito.
const WCAG_21_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");

/** Uma linha por nó em violação: regra, impacto, seletor e o resumo do axe. */
async function violations(page: Page) {
  await settle(page);
  return page.evaluate(async (tags) => {
    const { axe } = window as unknown as { axe: typeof import("axe-core") };
    const { violations } = await axe.run(document, {
      runOnly: { type: "tag", values: tags },
      resultTypes: ["violations"],
    });
    return violations.flatMap((rule) =>
      rule.nodes.map(
        (node) => `${rule.id} [${rule.impact}] ${node.target.join(" ")}: ${node.failureSummary}`,
      ),
    );
  }, WCAG_21_AA);
}

for (const theme of THEMES) {
  test(`toda story do catálogo sem violação WCAG 2.1 A/AA no axe (tema ${theme})`, async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const ids = await openCatalog(page, theme);
    await page.addScriptTag({ path: AXE });
    for (const id of ids) {
      await showStory(page, id, theme);
      expect.soft(await violations(page), id).toEqual([]);
    }
  });

  test(`o Studio sem violação WCAG 2.1 A/AA: canvas, painel, paleta e modelos (tema ${theme})`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme: theme }); // o app segue o tema do sistema
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Adicionar nó" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator("html")).toHaveCSS("color-scheme", theme);
    await page.addScriptTag({ path: AXE });
    expect.soft(await violations(page), "canvas").toEqual([]);
    // O axe deixa a atribuição como "incompleto" (fundo translúcido): o #999 do React Flow não pode
    // voltar; o contraste do token que entra no lugar é o do tokens.test.
    const attribution = page.locator(".react-flow__attribution a");
    await expect(attribution).not.toHaveCSS("color", "rgb(153, 153, 153)");
    await page.getByRole("button", { name: "Atalhos do teclado" }).click();
    expect.soft(await violations(page), "atalhos").toEqual([]);
    // Nó selecionado sobe de camada: só assim o axe mede o contraste dos selos dele.
    await page.locator(".react-flow__node").first().click();
    await expect(page.getByRole("complementary")).toBeVisible();
    expect.soft(await violations(page), "painel de propriedades").toEqual([]);
    await page.getByRole("button", { name: "Adicionar nó" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect.soft(await violations(page), "paleta").toEqual([]);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Modelos" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect.soft(await violations(page), "modelos").toEqual([]);
  });
}
