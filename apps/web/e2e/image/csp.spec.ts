import { expect, test } from "@playwright/test";

// O Studio da imagem de produção sob os cabeçalhos do nginx (docker/nginx.conf). A CSP não pode
// quebrar o app: o teste passa por tudo o que ele monta, inclusive os pedaços sob demanda e os
// diálogos do Radix, e reprova toda violação. Dois detectores: o evento `securitypolicyviolation` e
// o console, onde o Chromium escreve "violates the following Content Security Policy directive".

type Spy = { cspSeen: string[]; cspStep: string };

test("o Studio inteiro sob a CSP do nginx, sem violação nem erro no console", async ({ page }) => {
  let step = "abrir";
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`${step}: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`${step}: ${error.message}`));
  await page.addInitScript(() => {
    const spy: Spy = { cspSeen: [], cspStep: "abrir" };
    Object.assign(window, spy);
    const seen = (event: SecurityPolicyViolationEvent) =>
      spy.cspSeen.push(
        `${(window as unknown as Spy).cspStep}: ${event.effectiveDirective} ${event.blockedURI}`,
      );
    window.addEventListener("securitypolicyviolation", seen, true);
  });
  const go = async (name: string, action: () => Promise<unknown>) => {
    step = name;
    await page.evaluate((cspStep) => Object.assign(window, { cspStep }), name);
    await action();
  };

  const response = await page.goto("/");
  // Sem a CSP aplicada, "nenhuma violação" não provaria nada.
  expect(response?.headers()["content-security-policy"]).toContain("default-src 'none'");
  await expect(page.getByRole("button", { name: "Adicionar nó" })).toBeVisible();
  await go("atalhos", () => page.getByRole("button", { name: "Atalhos do teclado" }).click());
  await go("painel e Salvar", async () => {
    await page.locator(".react-flow__node-gateway").click();
    await page.getByLabel("Modelo", { exact: true }).fill("openai/gpt-4o-mini");
    await page.getByRole("button", { name: "Salvar" }).click();
  });
  await go("paleta", async () => {
    await page.getByRole("button", { name: "Adicionar nó" }).click();
    await page.getByLabel("Buscar tipo de nó").fill("cache");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeHidden();
  });
  await go("modelos", async () => {
    await page.getByRole("button", { name: "Modelos" }).click();
    await page.getByRole("button", { name: /RAG simples/ }).click();
    await page.getByRole("button", { name: "Substituir" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  });
  await go("organizar", () => page.getByRole("button", { name: "Organizar" }).click());
  await go("exportar SVG", () =>
    Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Exportar SVG" }).click(),
    ]),
  );
  await go("desfazer", () => page.getByRole("button", { name: "Desfazer" }).click());

  // Controle positivo, que serve também de barreira: um script inline tem de ser barrado e chegar
  // aos dois detectores. Os avisos saem em ordem: quando o dele chega, os anteriores já chegaram.
  await go("controle", () =>
    page.evaluate(() => {
      const script = document.createElement("script");
      script.textContent = "Object.assign(window, { inlineRan: true })";
      document.head.append(script);
    }),
  );
  const seen = () => page.evaluate(() => (window as unknown as Spy).cspSeen);
  await expect.poll(seen).toContain("controle: script-src-elem inline");
  await expect.poll(() => errors.some((error) => error.startsWith("controle: "))).toBe(true);
  expect(await seen()).toEqual(["controle: script-src-elem inline"]);
  expect(errors).toEqual([expect.stringMatching(/^controle: .*Content Security Policy/)]);
  expect(await page.evaluate(() => "inlineRan" in window)).toBe(false);
});
