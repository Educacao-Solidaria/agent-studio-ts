import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { isObserved, triggerAllResizes, triggerResize } from "../test/browser-mocks.ts";
import { VirtualMessages } from "./virtual-messages.tsx";

type Message = { id: string; text: string };
const messages = (count: number, from = 0): Message[] =>
  Array.from({ length: count }, (_, i) => ({ id: `m${from + i}`, text: `mensagem ${from + i}` }));
const ESTIMATE = 96;
const OVERSCAN = 600;
const id = (row: Element) => (row.firstElementChild as HTMLElement).dataset.id ?? "";

/**
 * O layout que o jsdom não tem: a área (400 px), cada mensagem com a altura de `heights`
 * (variável, 40 a 120 px), as linhas em fluxo depois do espaço de cima, e o `scrollTop` recortado
 * como no navegador (inclusive quando o conteúdo encolhe). `measured` anota quem já foi medida.
 */
function setup(initial: Message[]) {
  const area = { height: 400 };
  const heights = new Map<string, number>();
  const heightOf = (key: string) => heights.get(key) ?? 40 + (Number(key.slice(1)) % 5) * 20;
  const measured = new Set<string>();
  const ui = (items: Message[]) => (
    <VirtualMessages items={items} getKey={(m) => m.id} estimateSize={ESTIMATE} overscan={OVERSCAN}>
      {(m) => <p data-id={m.id}>{m.text}</p>}
    </VirtualMessages>
  );
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0); // um quadro na hora: o teste não espera o relógio
    return 0;
  });
  const result = render(ui(initial));
  const firstPaint = screen.queryAllByRole("listitem").map(id);
  const scroller = result.container.querySelector(".overflow-y-auto") as HTMLDivElement;
  const sizer = screen.getByRole("list").parentElement as HTMLElement;
  const rows = () => screen.queryAllByRole("listitem");
  const pad = (side: "paddingTop" | "paddingBottom") => Number.parseFloat(sizer.style[side]) || 0;
  const marginOf = (row: Element) => Number.parseFloat((row as HTMLElement).style.marginTop) || 0;
  const startOf = (row: Element) => {
    let at = pad("paddingTop") + marginOf(row);
    for (let prev = row.previousElementSibling; prev; prev = prev.previousElementSibling) {
      at += marginOf(prev) + heightOf(id(prev));
    }
    return at;
  };
  const endOf = (row: Element) => startOf(row) + heightOf(id(row));
  const inFlow = () => rows().reduce((sum, row) => sum + marginOf(row) + heightOf(id(row)), 0);
  const total = () => pad("paddingTop") + inFlow() + pad("paddingBottom");
  const maxTop = () => Math.max(0, total() - area.height);
  let top = 0;
  Object.defineProperties(scroller, {
    scrollHeight: { configurable: true, get: () => Math.max(total(), area.height) },
    clientHeight: { configurable: true, get: () => area.height },
    scrollTop: {
      configurable: true,
      get: () => {
        top = Math.min(top, maxTop());
        return top;
      },
      set: (value: number) => {
        top = Math.min(Math.max(0, value), maxTop());
      },
    },
  });
  scroller.scrollTo = vi.fn((options: ScrollToOptions) => {
    scroller.scrollTop = options.top ?? 0;
  }) as typeof scroller.scrollTo;
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.tagName !== "LI") return 0;
    measured.add(id(this));
    return heightOf(id(this));
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    const row = this.tagName === "LI";
    const y = row ? startOf(this) - scroller.scrollTop : 0;
    return DOMRect.fromRect({ y, width: 300, height: row ? heightOf(id(this)) : area.height });
  });
  const measureRows = () => {
    for (const row of rows()) triggerResize(row, { width: 300, height: heightOf(id(row)) });
  };
  // O ciclo do navegador: a 1ª medição avisa todo observado; depois mudam o sizer e as linhas
  // (cada linha nova é medida ao entrar), não a área; quem está grudado rola e a rolagem redesenha.
  let firstRound = true;
  const settle = () => {
    for (let round = 0; round < 6; round++) {
      act(() => {
        if (firstRound) triggerAllResizes();
        measureRows();
        triggerResize(sizer, { width: 300, height: total() });
      });
      act(() => void fireEvent.scroll(scroller));
      firstRound = false;
    }
  };
  settle();
  const rerender = (items: Message[]) => {
    result.rerender(ui(items));
    settle();
  };
  const userScroll = (to: number) => {
    act(() => {
      scroller.scrollTop = to;
      fireEvent.scroll(scroller);
    });
    settle();
  };
  // O que está no DOM é exatamente a tela mais o `overscan` de cada lado (a regra do componente).
  const expectRange = () => {
    // A última pode estar presa no fim (depois de um espaço): o intervalo termina antes dela.
    const contiguous = rows().filter((row) => marginOf(row) === 0);
    const [head, tail] = [contiguous[0] as Element, contiguous.at(-1) as Element];
    const low = scroller.scrollTop - OVERSCAN;
    const high = scroller.scrollTop + area.height + OVERSCAN;
    if (head.getAttribute("aria-posinset") !== "1") {
      expect([startOf(head) <= low, endOf(head) > low]).toEqual([true, true]);
    }
    if (tail.getAttribute("aria-posinset") !== tail.getAttribute("aria-setsize")) {
      expect([startOf(tail) <= high, endOf(tail) > high]).toEqual([true, true]);
    }
  };
  // Altura que a lista conhece: a medida, ou a estimativa de quem nunca chegou ao DOM.
  const known = (list: Message[]) =>
    list.reduce((sum, m) => sum + (measured.has(m.id) ? heightOf(m.id) : ESTIMATE), 0);
  const rowOf = (key: string) => rows().find((row) => id(row) === key);
  const tools = {
    area,
    sizer,
    heights,
    measured,
    firstPaint,
    measureRows,
    settle,
    rerender,
    userScroll,
  };
  return { ...tools, scroller, total, known, rows, rowOf, startOf, endOf, expectRange };
}

it("milhares de mensagens: abre no fim, só a tela e o overscan no DOM, total pelas medidas", () => {
  const all = messages(5_000);
  const { rows, total, known, scroller, measured, firstPaint, expectRange } = setup(all);
  // O 1º render já é o das últimas (não o do topo com a última presa no fim).
  expect([firstPaint.includes("m0"), firstPaint.includes("m4998")]).toEqual([false, true]);
  expect(rows().length).toBeLessThan(40);
  expect(rows().at(-1)?.getAttribute("aria-posinset")).toBe("5000");
  expect(rows().at(-1)?.getAttribute("aria-setsize")).toBe("5000");
  expect(scroller.scrollTop).toBe(total() - 400);
  expectRange();
  expect(measured.size).toBeGreaterThanOrEqual(rows().length); // mediu o que está no DOM
  expect(total()).toBe(known(all));
});

it("no meio da lista: tela e overscan dos dois lados, e o espaço de baixo fecha a conta", () => {
  const all = messages(1_000);
  const { total, known, userScroll, expectRange, rows } = setup(all);
  userScroll(total() / 2);
  expectRange();
  expect(rows()[0]?.getAttribute("aria-posinset")).not.toBe("1");
  expect(total()).toBe(known(all));
});

it("mensagem nova com o fim à vista vai junto; quem subiu fica e ganha 'Novas mensagens'", () => {
  const { rows, rerender, scroller, total, userScroll } = setup(messages(50));
  rerender(messages(51));
  expect([rows().at(-1)?.textContent, scroller.scrollTop]).toEqual(["mensagem 50", total() - 400]);
  userScroll(200); // a pessoa sobe para ler (num salto, o que entra é medido e acerta a posição)
  const reading = scroller.scrollTop;
  rerender(messages(52));
  expect(scroller.scrollTop).toBe(reading);
  fireEvent.click(screen.getByRole("button", { name: "Novas mensagens" }));
  expect(scroller.scrollTop).toBe(total() - 400);
});

it("texto chegando na última com a pessoa lá em cima: ela segue no DOM e aparece o aviso", () => {
  const { rows, rowOf, heights, measureRows, sizer, total, userScroll } = setup(messages(300));
  userScroll(1_000); // longe do fim: as do meio saem do DOM, a última fica
  expect(rows().length).toBeLessThan(40);
  expect(rowOf("m299")?.getAttribute("aria-posinset")).toBe("300");
  heights.set("m299", 800);
  act(measureRows);
  act(() => triggerResize(sizer, { width: 300, height: total() }));
  expect(screen.getByRole("button", { name: "Novas mensagens" })).toBeTruthy();
});

it("subindo para mensagens nunca medidas, o que está à vista não pula", () => {
  const { rows, scroller, startOf, userScroll } = setup(messages(300));
  const anchor = rows()[0] as Element; // a de cima, já medida, segue no DOM depois de subir
  const before = startOf(anchor) - scroller.scrollTop;
  userScroll(scroller.scrollTop - 500); // entram linhas em cima, estimadas até medir
  expect(rows()[0]).not.toBe(anchor);
  expect(startOf(anchor) - scroller.scrollTop).toBe(before + 500);
});

it("mensagem cruzando o topo da tela que cresce embaixo não arrasta a tela", () => {
  const { rows, scroller, startOf, endOf, heights, userScroll } = setup(messages(300));
  userScroll(scroller.scrollTop - 2_000);
  const fold = scroller.scrollTop;
  const crossing = rows().find((r) => startOf(r) < fold && endOf(r) > fold);
  if (!crossing) throw new Error("nenhuma mensagem cruzando o topo da tela");
  heights.set(id(crossing), 500);
  act(() => triggerResize(crossing, { width: 300, height: 500 }));
  expect(scroller.scrollTop).toBe(fold);
});

it("grudada no fim, mensagem acima que encolhe não solta o grude", () => {
  const { rows, scroller, startOf, endOf, heights, rerender, total } = setup(messages(100));
  // Inteira acima e alta: encolher para 10 px recua mais que o limiar do grude (48 px).
  const tall = (r: Element) => endOf(r) <= scroller.scrollTop && endOf(r) - startOf(r) >= 100;
  const above = rows().find(tall) as Element;
  heights.set(id(above), 10); // o conteúdo encolhe e o navegador recua o scrollTop
  act(() => triggerResize(above, { width: 300, height: 10 }));
  // O `scroll` desse recuo chega antes dos observadores do quadro seguinte (é o navegador).
  act(() => void fireEvent.scroll(scroller));
  rerender(messages(101));
  expect(scroller.scrollTop).toBe(total() - 400);
});

it("a área cresce (janela maior) sem rolagem: as mensagens cobrem a área nova", () => {
  const { area, scroller, expectRange, measureRows, total, userScroll } = setup(messages(300));
  userScroll(total() / 2); // no meio, crescer a área não rola nada: só o observador avisa
  area.height = 1_000;
  act(() => triggerResize(scroller, { width: 300, height: 1_000 }));
  for (let round = 0; round < 4; round++) act(measureRows); // as que entraram embaixo
  expectRange();
});

it("medir sem rolar já redesenha: mensagens que encolhem abrem espaço para outras", () => {
  const { rows, heights, measureRows, total, userScroll } = setup(messages(300));
  userScroll(total() / 2);
  const before = rows().length;
  for (const row of rows()) heights.set(id(row), 10);
  act(measureRows);
  expect(rows().length).toBeGreaterThan(before);
});

it("linha que sai do DOM deixa de ser observada", () => {
  const { rows, userScroll } = setup(messages(300));
  const gone = rows()[0] as Element;
  userScroll(0);
  expect([gone.isConnected, isObserved(gone)]).toEqual([false, false]);
});

it("chave estável: mensagens antigas carregadas no topo não embaralham as alturas medidas", () => {
  const { rows, rowOf, rerender, known, startOf } = setup(messages(30));
  const before = rowOf("m29");
  const older = { id: "m-1", text: "antiga" };
  rerender([older, ...messages(30)]);
  const last = rows().at(-1) as HTMLElement;
  expect(last).toBe(before); // a mesma linha segue com a mesma mensagem (chave, não posição)
  expect([id(last), startOf(last)]).toEqual(["m29", known([older, ...messages(29)])]);
});

it("lista vazia: nada no DOM, altura zero e sem erro", () => {
  const { rows, total } = setup([]);
  expect([rows().length, total()]).toEqual([0, 0]);
});
