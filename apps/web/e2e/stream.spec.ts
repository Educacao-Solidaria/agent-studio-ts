import { expect, type Page, test } from "@playwright/test";
import { SCENARIOS } from "./stream-mock.ts";

type Connection = { scenario: string; lastEventId: string | null };
const connections = (page: Page) =>
  page.evaluate(() => (window as unknown as { e2eConnections: Connection[] }).e2eConnections);
/** Distância do fim da área de rolagem do chat, em px. */
const fromBottom = (page: Page) =>
  page
    .locator(".overflow-y-auto")
    .evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight);

const scrollTop = (page: Page) => page.locator(".overflow-y-auto").evaluate((el) => el.scrollTop);
/** `scrollTop` depois de a rolagem suave da roda terminar (duas leituras iguais seguidas). */
async function settled(page: Page) {
  for (let last = Number.NaN; ; await page.waitForTimeout(100)) {
    const now = await scrollTop(page);
    if (now === last) return now;
    last = now;
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto("/e2e/stream.html");
  // 1º carregamento: o Vite compila a página e o MSW registra o service worker.
  await expect(page.getByRole("button", { name: "acentos" })).toBeVisible({ timeout: 30_000 });
});

test("o texto chega inteiro e na ordem, com multibyte partido entre pedaços e código destacado", async ({
  page,
}) => {
  const reply = page.getByTestId("reply");
  await page.getByRole("button", { name: "acentos" }).click();
  await expect(page.getByTestId("outcome")).toHaveText("done");
  await expect(reply.locator("p").first()).toHaveText("Olá! Ação, coração e pão — 🚀 漢字 ✓");
  await expect(reply.locator("pre code")).toHaveText('const saudação = "olá";');
  await expect(reply.locator("p").last()).toHaveText("Fim.");
  expect(await reply.textContent()).not.toContain("�"); // nenhum caractere quebrado
  // Destaque do Shiki (sob demanda): tokens com cor própria dentro do bloco.
  await expect(reply.locator("pre[data-lang=typescript] span[style]").first()).toBeVisible();
  // TTFT: o gateway falso segura o primeiro pedaço por 300 ms.
  const ttft = Number((await page.locator("[role=timer]").textContent())?.replace(/\D/g, ""));
  expect(ttft).toBeGreaterThanOrEqual(300);
  expect(ttft).toBeLessThan(2000);
});

test("Parar (botão ou Esc) fecha o stream na hora e o texto para de crescer", async ({ page }) => {
  const reply = page.getByTestId("reply");
  for (const how of ["botão", "Esc"]) {
    await page.getByRole("button", { name: "lento" }).click();
    await expect(reply).toContainText("palavra2 ");
    if (how === "Esc") await page.keyboard.press("Escape");
    else await page.getByRole("button", { name: "Parar" }).click();
    await expect(page.getByTestId("outcome")).toHaveText("stopped");
    const frozen = await reply.textContent();
    await page.waitForTimeout(600); // 4 pedaços teriam chegado
    expect(await reply.textContent()).toBe(frozen);
    expect(frozen?.length).toBeLessThan(SCENARIOS.lento.join("").length);
    await expect(page.getByRole("button", { name: "Parar" })).toHaveCount(0);
  }
  await expect(page.getByLabel("Mensagem")).toBeFocused(); // o foco não se perde com o botão
});

test("auto-scroll: gruda no fim; subir solta sem ser puxado; Novas mensagens volta ao fim", async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 400 }); // a área transborda com poucas linhas
  await page.emulateMedia({ reducedMotion: "reduce" }); // rolagem instantânea, sem animação
  await page.getByRole("button", { name: "longo" }).click();
  await expect(page.getByTestId("reply")).toContainText("Linha 20 ");
  expect(await fromBottom(page)).toBeLessThanOrEqual(48);
  await page.locator(".overflow-y-auto").hover();
  await page.mouse.wheel(0, -300);
  const held = await settled(page);
  await expect(page.getByRole("button", { name: "Novas mensagens" })).toBeVisible();
  expect(await scrollTop(page)).toBe(held); // o texto que chega não puxa de volta
  await page.getByRole("button", { name: "Novas mensagens" }).click();
  await expect.poll(() => fromBottom(page)).toBeLessThanOrEqual(1);
  await expect(page.getByTestId("outcome")).toHaveText("done");
  expect(await fromBottom(page)).toBeLessThanOrEqual(1); // seguiu grudado até o fim
});

test("queda no meio: reconecta com Last-Event-ID e o texto fecha sem buraco nem repetição", async ({
  page,
}) => {
  await page.getByRole("button", { name: "queda" }).click();
  await expect(page.getByTestId("outcome")).toHaveText("done");
  await expect(page.getByTestId("reply")).toHaveText(SCENARIOS.queda.join(""));
  expect(await connections(page)).toEqual([
    { scenario: "queda", lastEventId: null },
    { scenario: "queda", lastEventId: "3" },
  ]);
});
