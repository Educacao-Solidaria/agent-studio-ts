import { describe, expect, it, vi } from "vitest";
import { setMediaQuery, triggerIntersection, triggerResize } from "./browser-mocks.ts";

// renderWithProviders é exercitado em components/ui/overlays.test.tsx (o Tooltip exige o provider).
describe("mocks de browser", () => {
  it("matchMedia não casa por padrão e avisa os ouvintes quando muda", () => {
    const dark = window.matchMedia("(prefers-color-scheme: dark)");
    expect(dark.matches).toBe(false);
    const onChange = vi.fn();
    dark.addEventListener("change", onChange);

    setMediaQuery("(prefers-color-scheme: dark)", true);

    expect(window.matchMedia("(prefers-color-scheme: dark)").matches).toBe(true);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ matches: true }));
    expect(window.matchMedia("(min-width: 768px)").matches).toBe(false);
  });

  it("ResizeObserver só dispara para o alvo observado", () => {
    const [watched, other] = [document.createElement("div"), document.createElement("div")];
    const callback = vi.fn();
    new ResizeObserver(callback).observe(watched);

    triggerResize(other, { width: 10, height: 10 });
    expect(callback).not.toHaveBeenCalled();

    triggerResize(watched, { width: 320, height: 200 });
    const [[entry]] = callback.mock.calls[0] as [[ResizeObserverEntry]];
    expect(entry.contentRect.width).toBe(320);
  });

  it("IntersectionObserver dispara até o unobserve", () => {
    const target = document.createElement("div");
    const callback = vi.fn();
    const observer = new IntersectionObserver(callback);
    observer.observe(target);

    triggerIntersection(target, true);
    expect(callback.mock.calls[0]?.[0][0]).toMatchObject({ target, isIntersecting: true });

    observer.unobserve(target);
    triggerIntersection(target, false);
    expect(callback).toHaveBeenCalledOnce();
    expect(observer.takeRecords()).toEqual([]);
  });

  it("clipboard guarda o texto em memória", async () => {
    await navigator.clipboard.writeText("agent-42");
    await expect(navigator.clipboard.readText()).resolves.toBe("agent-42");
  });

  it("estado recomeça a cada teste", async () => {
    await expect(navigator.clipboard.readText()).resolves.toBe("");
    expect(window.matchMedia("(prefers-color-scheme: dark)").matches).toBe(false);
  });
});
