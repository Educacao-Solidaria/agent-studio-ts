import { vi } from "vitest";

const stub = (set: Record<PropertyKey, unknown>, key: PropertyKey) =>
  key === "measureText" ? () => ({ width: 8 }) : (set[key] ?? (() => undefined));

/** Contexto 2D de mentira em todo canvas (o jsdom não tem): o Chart.js de verdade desenha no vazio. */
export function fakeCanvas2d() {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: Element) {
    const get = (set: Record<PropertyKey, unknown>, key: PropertyKey) =>
      key === "canvas" ? this : stub(set, key);
    return new Proxy({}, { get }) as never;
  });
}
