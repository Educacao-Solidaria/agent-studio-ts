import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { expect, type Page, test } from "@playwright/test";

// WCAG 2.0 e 2.1, níveis A e AA. As regras "best-practice" do axe ficam de fora de propósito.
const WCAG_21_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const THEMES = ["light", "dark"] as const;
const STORY_FILES = readdirSync(new URL("../src", import.meta.url), { recursive: true })
  .map(String)
  .filter((file) => file.endsWith(".stories.tsx"));

type Catalog = { storyIds?: string[]; showStory(id: string): void };

/** Espera a página parar de mudar: 300 ms sem nó ou atributo novo no DOM (o pedaço sob demanda,
 * como o do Chart.js, chega antes da análise), com teto de 5 s para o que muda sem parar
 * (execução ao vivo, lista recebendo mensagens). Texto que só cresce não segura a espera. */
const settle = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((done) => {
        const finish = () => {
          observer.disconnect();
          clearTimeout(quiet);
          clearTimeout(cap);
          done();
        };
        const observer = new MutationObserver(() => {
          clearTimeout(quiet);
          quiet = setTimeout(finish, 300);
        });
        let quiet = setTimeout(finish, 300);
        const cap = setTimeout(finish, 5000);
        observer.observe(document.body, { subtree: true, childList: true, attributes: true });
      }),
  );

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
    await page.goto(`/e2e/stories.html?theme=${theme}`);
    const ids = await page
      .waitForFunction(() => (window as unknown as Catalog).storyIds, null, { timeout: 60_000 })
      .then((handle) => handle.jsonValue());
    // Arquivo de story que não carregou passaria calado: cada um do disco tem de estar na página.
    expect(new Set(ids?.map((id) => id.split(" › ")[0]))).toEqual(new Set(STORY_FILES));
    await page.addScriptTag({ path: AXE });
    for (const id of ids ?? []) {
      await page.evaluate((story) => (window as unknown as Catalog).showStory(story), id);
      await expect(page.locator("#root > *").first(), id).toBeAttached();
      await expect(page.locator("html"), id).toHaveCSS("color-scheme", theme); // o tema pegou
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
