import { afterEach, expect, it, vi } from "vitest";
import { config } from "zod";
import main from "../main.tsx?raw";

afterEach(() => vi.unstubAllGlobals());

it("é o 1º import do app: vale antes de qualquer schema, em qualquer pedaço", () => {
  expect(main.match(/^import .*/m)?.[0]).toMatch(/^import "\.\/lib\/zod-jitless\.ts";/);
});

it("com ele, o contrato SSE nasce e valida sem `new Function`, que a CSP do nginx barra", async () => {
  // O zod sonda o eval com `new Function("")`, lendo a global na hora: o espião faz o papel da CSP.
  const built = vi.fn();
  const spy = new Proxy(Function, {
    construct: (target, args) => {
      built(args);
      return Reflect.construct(target, args);
    },
  });
  vi.stubGlobal("Function", spy);
  await import("./zod-jitless.ts");
  const { StreamChunkSchema } = await import("../../../../src/types/sse.ts");
  const chunk = { id: "c1", model: "m", delta_content: "olá", is_last: false };
  expect(StreamChunkSchema.parse(chunk)).toEqual(chunk);
  expect(StreamChunkSchema.safeParse({ ...chunk, is_last: "não" }).success).toBe(false);
  expect(built).not.toHaveBeenCalled();
  expect(config().jitless).toBe(true);
});
