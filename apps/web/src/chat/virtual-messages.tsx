import { type ReactNode, useCallback, useEffect, useReducer, useRef, useState } from "react";
import { cn } from "../lib/cn.ts";
import { NewMessagesButton, useStickToBottom } from "./auto-scroll.tsx";

export type VirtualMessagesProps<T> = {
  items: readonly T[];
  /** Chave estável da mensagem: a altura medida é dela, não da posição na lista. */
  getKey: (item: T) => string;
  children: (item: T, index: number) => ReactNode;
  estimateSize?: number; // px de uma mensagem que ainda não chegou ao DOM
  overscan?: number; // px renderizados além da tela, de cada lado
  className?: string;
};

/** Primeiro índice cujo fim passa de `y` (os inícios crescem: busca binária). */
function firstEndingAfter(starts: number[], sizes: number[], y: number) {
  let [low, high] = [0, starts.length];
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((starts[middle] ?? 0) + (sizes[middle] ?? 0) > y) high = middle;
    else low = middle + 1;
  }
  return low;
}

/**
 * Lista de mensagens virtualizada: só as perto da tela ficam no DOM, cada uma com a altura medida
 * (variável: código, tabelas, texto chegando) e guardada pela chave; as outras viram espaço em
 * cima e embaixo; mensagem acima da tela que muda de altura não desloca o que está à vista. A
 * altura total é a do `contentRef` do `useStickToBottom` (PR 55): a rolagem segue grudando no
 * fim enquanto o texto chega, solta quando a pessoa sobe e mostra "Novas mensagens".
 * ponytail: soma as alturas a cada render (O(n), folga de sobra com milhares de mensagens);
 * com centenas de milhares, troque por uma árvore de somas.
 */
export function VirtualMessages<T>({
  items,
  getKey,
  children,
  estimateSize = 96,
  overscan = 600,
  className,
}: VirtualMessagesProps<T>) {
  const { scrollRef, contentRef, unseen, scrollToBottom } = useStickToBottom();
  const measured = useRef(new Map<string, number>());
  const [, redraw] = useReducer((frame: number) => frame + 1, 0);
  // Começa pelo fim (é onde a conversa abre): o 1º render já é o das últimas mensagens.
  const [view, setView] = useState({ top: Number.POSITIVE_INFINITY, height: 0 });

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    let frame = 0;
    const read = () => {
      frame = 0;
      setView({ top: scroller.scrollTop, height: scroller.clientHeight });
    };
    const schedule = () => {
      frame ||= requestAnimationFrame(read); // um render por quadro, por mais eventos que venham
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(scroller);
    scroller.addEventListener("scroll", schedule, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scroller.removeEventListener("scroll", schedule);
    };
  }, [scrollRef]);

  // Um observador para todas as linhas: cada uma entra ao montar e sai ao desmontar. Linha acima
  // da tela que muda de altura empurraria o que está à vista: a rolagem anda a diferença — na 1ª
  // medida se ela começa acima, depois só se estava inteira acima (a mensagem que cresce embaixo
  // não arrasta a tela). A âncora de rolagem do navegador fica desligada para não somar duas vezes.
  const rows = useRef<ResizeObserver | null>(null);
  useEffect(() => () => rows.current?.disconnect(), []);
  const measure = useCallback(
    (row: HTMLLIElement | null) => {
      if (!row) return;
      rows.current ??= new ResizeObserver((entries) => {
        const scroller = scrollRef.current;
        const fold = scroller?.getBoundingClientRect().top ?? 0;
        let [changed, shift] = [false, 0];
        for (const { target } of entries) {
          const element = target as HTMLElement;
          const key = element.dataset.key ?? "";
          const [before, height] = [measured.current.get(key), element.offsetHeight];
          if (before === height) continue;
          const top = element.getBoundingClientRect().top - fold; // < 0: começa acima da tela
          if (before === undefined ? top < 0 : top + before <= 0)
            shift += height - (before ?? estimateSize);
          measured.current.set(key, height);
          changed = true;
        }
        // No fim, quem manda é o `useStickToBottom` (volta ao fim a cada mudança): mexer aqui
        // pareceria a pessoa subindo e soltaria o grude.
        const atEnd =
          scroller && scroller.scrollTop >= scroller.scrollHeight - scroller.clientHeight - 1;
        if (scroller && shift && !atEnd) scroller.scrollTop += shift;
        if (changed) redraw();
      });
      rows.current.observe(row);
      return () => rows.current?.unobserve(row);
    },
    [scrollRef, estimateSize],
  );

  const sizes = items.map((item) => measured.current.get(getKey(item)) ?? estimateSize);
  let total = 0;
  const starts = sizes.map((size) => {
    total += size;
    return total - size;
  });
  const top = Math.min(view.top, Math.max(0, total - view.height));
  const first = Math.min(firstEndingAfter(starts, sizes, top - overscan), items.length);
  const end = Math.max(first, firstEndingAfter(starts, sizes, top + view.height + overscan) + 1);
  const stop = Math.min(end, items.length);
  // A última fica sempre no DOM, depois do espaço das do meio: é a que recebe o texto do stream,
  // e ela crescer com a pessoa lá em cima tem de chegar ao `useStickToBottom` ("Novas mensagens").
  const last = items.length - 1;
  const pinned = last >= stop ? items[last] : undefined;
  const gap = pinned === undefined ? 0 : (starts[last] ?? 0) - (starts[stop] ?? 0);
  const row = (item: T, index: number, marginTop = 0) => (
    <li
      key={getKey(item)}
      ref={measure}
      data-key={getKey(item)}
      aria-posinset={index + 1}
      aria-setsize={items.length}
      className="flow-root" // a margem da mensagem fica dentro da linha medida
      style={marginTop ? { marginTop } : undefined}
    >
      {children(item, index)}
    </li>
  );
  return (
    <div className={cn("relative min-h-0", className)}>
      <div ref={scrollRef} tabIndex={-1} className="h-full overflow-y-auto [overflow-anchor:none]">
        <div ref={contentRef} style={{ paddingTop: starts[first] ?? 0 }}>
          <ol>
            {items.slice(first, stop).map((item, offset) => row(item, first + offset))}
            {pinned !== undefined && row(pinned, last, gap)}
          </ol>
        </div>
      </div>
      {unseen && <NewMessagesButton onClick={scrollToBottom} />}
    </div>
  );
}
