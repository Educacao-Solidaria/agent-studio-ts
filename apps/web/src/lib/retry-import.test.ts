import { describe, expect, it, vi } from "vitest";
import { retryImport } from "./retry-import.ts";

type Chunk = { name: string };
const CHUNK = `${location.origin}/assets/canvas-dialogs-abc.js`;
/** O erro do Chromium quando o pedaço não baixa (o do Firefox muda só o começo da frase). */
const offline = (url = CHUNK) =>
  new TypeError(`Failed to fetch dynamically imported module: ${url}`);
const loader = () => vi.fn<() => Promise<Chunk>>();
const byUrl = () => vi.fn<(href: string) => Promise<Chunk>>();

describe("retryImport", () => {
  it("baixa uma vez: pedidos ao mesmo tempo e os seguintes recebem o mesmo módulo", async () => {
    const load = loader().mockResolvedValue({ name: "pedaço" });
    const fresh = byUrl();
    const get = retryImport(load, fresh);
    const [first, second] = await Promise.all([get(), get()]);
    expect(second).toBe(first);
    expect(await get()).toBe(first);
    expect([load.mock.calls.length, fresh.mock.calls.length]).toEqual([1, 0]);
  });

  it("depois de falhar na rede, pede a URL do pedaço com ?retry=N até dar certo", async () => {
    const error = offline();
    const load = loader().mockRejectedValue(error);
    const fresh = byUrl()
      .mockRejectedValueOnce(offline(`${CHUNK}?retry=1`))
      .mockResolvedValue({ name: "de volta" });
    const get = retryImport(load, fresh);
    await expect(get()).rejects.toBe(error);
    await expect(get()).rejects.toThrow(`${CHUNK}?retry=1`);
    expect(await get()).toEqual({ name: "de volta" });
    expect(await get()).toEqual({ name: "de volta" }); // guardado: nenhum pedido a mais
    expect(load).toHaveBeenCalledTimes(1);
    expect(fresh.mock.calls).toEqual([[`${CHUNK}?retry=1`], [`${CHUNK}?retry=2`]]);
  });

  it("mensagem do Firefox, e URL que já tinha query: o retry entra junto", async () => {
    const message = `error loading dynamically imported module: ${CHUNK}?v=3`;
    const load = loader().mockRejectedValue(new TypeError(message));
    const fresh = byUrl().mockResolvedValue({ name: "ok" });
    const get = retryImport(load, fresh);
    await expect(get()).rejects.toThrow(message);
    expect(await get()).toEqual({ name: "ok" });
    expect(fresh).toHaveBeenCalledWith(`${CHUNK}?v=3&retry=1`);
  });

  it("sem a URL de um pedaço do app no erro, repete o import de origem", async () => {
    const failures = [
      new TypeError("Importing a module script failed."), // Safari: sem URL
      offline("https://cdn.exemplo.com/assets/x.js"), // outra origem: não é pedaço do app
      offline("assets/x.js"), // relativa: não é URL
      new TypeError("x is not a function"), // erro do próprio módulo ao rodar
      "rede", // rejeição que nem é Error
    ];
    for (const failure of failures) {
      const load = loader().mockRejectedValueOnce(failure).mockResolvedValue({ name: "ok" });
      const fresh = byUrl();
      const get = retryImport(load, fresh);
      await expect(get()).rejects.toBe(failure);
      expect(await get()).toEqual({ name: "ok" });
      expect([load.mock.calls.length, fresh.mock.calls.length], String(failure)).toEqual([2, 0]);
    }
  });

  it("a falha chega a todos os pedidos que esperavam; o pedido seguinte tenta de novo", async () => {
    const load = loader().mockRejectedValue(offline());
    const fresh = byUrl().mockResolvedValue({ name: "ok" });
    const get = retryImport(load, fresh);
    const settled = await Promise.allSettled([get(), get()]);
    expect(settled.map((result) => result.status)).toEqual(["rejected", "rejected"]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(await get()).toEqual({ name: "ok" });
    expect(fresh).toHaveBeenCalledTimes(1);
  });
});
