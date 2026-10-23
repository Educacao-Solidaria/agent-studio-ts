import { readdirSync } from "node:fs";
import { expect, type Page } from "@playwright/test";

// O catálogo de stories (e2e/stories.html) como os testes no navegador o percorrem: o de
// acessibilidade (a11y.spec) e o de regressão visual (visual/visual.spec).
export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

const STORY_FILES = readdirSync(new URL("../src", import.meta.url), { recursive: true })
  .map((file) => String(file).replaceAll("\\", "/")) // no Windows vem com barra invertida
  .filter((file) => file.endsWith(".stories.tsx"));

type Catalog = { storyIds?: string[]; showStory(id: string): void };

// Story cujo estado final vem depois de uma pausa sem mudança no DOM (o backoff de 250 a 500 ms da
// sondagem, o import do Shiki): os testes esperam por ele, senão veriam só o estado inicial.
// ponytail: lista à mão; story nova que muda por timer ou import entra aqui.
const READY: Record<string, string> = {
  "chat/code-block.stories.tsx › Highlighted": "pre[data-lang] span[style]",
  "components/offline-banner.stories.tsx › ServiceDown": "text=Serviço indisponível",
  "components/service-status.stories.tsx › CacheDown": 'text="Indisponível"',
};

/** Espera a página parar de mudar: 300 ms sem nó ou atributo novo no DOM (o pedaço sob demanda,
 * como o do Chart.js, costuma chegar antes), com teto de 5 s se ela nunca parar. Texto que só
 * cresce não segura a espera; o que chega depois de uma pausa maior está em READY. */
export const settle = (page: Page) =>
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

/** Abre o catálogo no tema e devolve os ids (`arquivo › story`). Arquivo de story que não carregou
 * e id citado (os de READY e os `named` de quem chama) que sumiu por renomeação reprovam aqui:
 * passariam calados. */
export async function openCatalog(page: Page, theme: Theme, named: string[] = []) {
  await page.goto(`/e2e/stories.html?theme=${theme}`);
  const ids = await page
    .waitForFunction(() => (window as unknown as Catalog).storyIds, null, { timeout: 60_000 })
    .then((handle) => handle.jsonValue());
  expect(new Set(ids?.map((id) => id.split(" › ")[0]))).toEqual(new Set(STORY_FILES));
  expect(ids).toEqual(expect.arrayContaining([...Object.keys(READY), ...named]));
  return ids ?? [];
}

/** Monta a story no lugar da anterior e espera o tema pegar e, se ela está em READY, o estado final. */
export async function showStory(page: Page, id: string, theme: Theme) {
  await page.evaluate((story) => (window as unknown as Catalog).showStory(story), id);
  await expect(page.locator("#root > *").first(), id).toBeAttached();
  await expect(page.locator("html"), id).toHaveCSS("color-scheme", theme);
  const ready = READY[id];
  if (ready) await expect(page.locator(ready).first(), id).toBeVisible();
}
