import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { setMediaQuery, triggerResize } from "../test/browser-mocks.ts";
import { AutoScroll } from "./auto-scroll.tsx";

/** O layout que o jsdom não tem: alturas do teste e `scrollTop` limitado como no navegador. */
function setup(threshold?: number, sizes = { content: 1000, view: 300 }) {
  const view = render(
    <AutoScroll threshold={threshold}>
      <p>mensagens</p>
    </AutoScroll>,
  );
  const scroller = view.container.querySelector(".overflow-y-auto") as HTMLDivElement;
  const content = scroller.firstElementChild as HTMLElement;
  let top = 0;
  Object.defineProperties(scroller, {
    scrollHeight: { configurable: true, get: () => Math.max(sizes.content, sizes.view) },
    clientHeight: { configurable: true, get: () => sizes.view },
    scrollTop: {
      configurable: true,
      get: () => top,
      set: (value: number) => {
        top = Math.min(Math.max(0, value), Math.max(0, sizes.content - sizes.view));
      },
    },
  });
  scroller.scrollTo = vi.fn((options: ScrollToOptions) => {
    scroller.scrollTop = options.top ?? 0;
  }) as typeof scroller.scrollTo;
  const measure = () => triggerResize(content, { width: 300, height: sizes.content });
  const grow = (px: number) =>
    act(() => {
      sizes.content += px;
      measure();
    });
  const userScroll = (to: number) =>
    act(() => {
      scroller.scrollTop = to;
      fireEvent.scroll(scroller);
    });
  act(measure); // a medição inicial que o navegador faz ao observar
  return { ...view, scroller, sizes, measure, grow, userScroll };
}

const newMessages = () => screen.queryByRole("button", { name: "Novas mensagens" });

describe("AutoScroll", () => {
  it("começa no fim e segue o conteúdo que cresce", () => {
    const { scroller, sizes, grow } = setup();
    expect(scroller.scrollTop).toBe(700);
    grow(200);
    expect(scroller.scrollTop).toBe(900);
    sizes.view = 200; // a área encolheu (janela menor): continua no fim
    act(() => triggerResize(scroller, { width: 300, height: 200 }));
    expect(scroller.scrollTop).toBe(1000);
    expect(newMessages()).toBeNull();
  });

  it("subir solta: o conteúdo novo não puxa de volta e aparece o botão", () => {
    const { scroller, measure, grow, userScroll } = setup();
    userScroll(400);
    act(measure); // medida de novo, mesmo tamanho: nada novo
    expect(newMessages()).toBeNull();
    grow(200);
    expect(scroller.scrollTop).toBe(400);
    expect(newMessages()).not.toBeNull();
    userScroll(300); // subir mais não tira o aviso
    expect(newMessages()).not.toBeNull();
  });

  it("empurrão dentro do limiar não solta; descer até o fim gruda de novo", () => {
    const { scroller, grow, userScroll } = setup();
    userScroll(670); // 30 px do fim
    grow(100);
    expect(scroller.scrollTop).toBe(800);
    userScroll(500);
    grow(100);
    expect(newMessages()).not.toBeNull();
    userScroll(900);
    expect(newMessages()).toBeNull();
    grow(100);
    expect(scroller.scrollTop).toBe(1000);
    userScroll(600); // soltou de novo, sem nada novo desde que grudou: sem botão
    expect(newMessages()).toBeNull();
  });

  it("a roda para cima solta antes do evento de scroll", () => {
    const { scroller, grow } = setup();
    act(() => void fireEvent.wheel(scroller, { deltaY: -40 }));
    grow(200);
    expect(scroller.scrollTop).toBe(700);
    expect(newMessages()).not.toBeNull();
  });

  it("nem a animação de volta ao fim nem o conteúdo que encolhe soltam", () => {
    const { scroller, sizes, grow, userScroll } = setup();
    userScroll(400);
    grow(100);
    scroller.scrollTo = vi.fn(); // animação: a posição chega pelos eventos de scroll
    fireEvent.click(newMessages() as HTMLElement);
    userScroll(500);
    userScroll(650); // a meio caminho, ainda longe do fim
    grow(100);
    expect(scroller.scrollTop).toBe(900);
    // Encolheu: o navegador recua o scrollTop até o novo máximo, e continua no fim.
    sizes.content = 700;
    userScroll(900);
    grow(100);
    expect(scroller.scrollTop).toBe(500);
  });

  it("o botão volta ao fim com animação, sem ela se pedirem menos movimento, e foca a área", () => {
    const { scroller, grow, userScroll } = setup();
    userScroll(400);
    grow(100);
    fireEvent.click(newMessages() as HTMLElement);
    expect(scroller.scrollTo).toHaveBeenLastCalledWith({ top: 1100, behavior: "smooth" });
    expect(newMessages()).toBeNull();
    expect(document.activeElement).toBe(scroller);
    setMediaQuery("(prefers-reduced-motion: reduce)", true);
    userScroll(300);
    grow(100);
    fireEvent.click(newMessages() as HTMLElement);
    expect(scroller.scrollTo).toHaveBeenLastCalledWith({ top: 1200, behavior: "auto" });
  });

  it("limiar NaN usa o padrão; conteúdo menor que a área nunca solta", () => {
    const { scroller, grow, userScroll } = setup(Number.NaN);
    userScroll(670);
    grow(10);
    expect(scroller.scrollTop).toBe(710);
    const small = setup(undefined, { content: 200, view: 300 });
    act(() => void fireEvent.wheel(small.scroller, { deltaY: -40 })); // nada a rolar: não solta
    small.grow(150); // passou da área: grudado, vai ao fim
    expect(small.scroller.scrollTop).toBe(50);
    expect(screen.queryAllByRole("button")).toEqual([]);
  });

  it("desmontar desliga o observador e os ouvintes", () => {
    const { scroller, sizes, measure, unmount } = setup();
    const removed = vi.spyOn(scroller, "removeEventListener");
    unmount();
    expect(removed).toHaveBeenCalledWith("scroll", expect.any(Function));
    expect(removed).toHaveBeenCalledWith("wheel", expect.any(Function));
    sizes.content += 500;
    measure();
    expect(scroller.scrollTop).toBe(700);
  });
});
