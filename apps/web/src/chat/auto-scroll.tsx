import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../components/icons.tsx";
import { Button } from "../components/ui/button.tsx";
import { cn } from "../lib/cn.ts";

/** Distância do fim, em px, que ainda conta como "no fim": um empurrão de leve não solta. */
export const STICK_THRESHOLD = 48;

/**
 * Rolagem que gruda no fim enquanto o conteúdo cresce (texto chegando) e solta quando a pessoa
 * sobe; volta a grudar quando ela desce até o fim ou chama `scrollToBottom`. Funciona com lista
 * virtualizada: `scrollRef` no elemento que rola e `contentRef` no que tem a altura total — os
 * dois montados junto com o hook, que só observa o que existe quando monta.
 *
 * Quem decide é a rolagem da pessoa, não a posição: rolar para cima solta (a roda solta já no
 * `wheel`, antes de o conteúdo novo puxar de volta), e rolar para baixo nunca solta — assim a
 * animação de `scrollToBottom` e o conteúdo que encolhe (o navegador recua o `scrollTop`, mas
 * continua no fim) não soltam por engano.
 */
export function useStickToBottom(threshold = STICK_THRESHOLD) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stuckRef = useRef(true); // ref, não estado: grudar e soltar não renderizam nada
  const [unseen, setUnseen] = useState(false); // conteúdo novo chegou enquanto estava solto
  const limit = Number.isFinite(threshold) ? Math.max(0, threshold) : STICK_THRESHOLD;

  const stick = useCallback((value: boolean) => {
    stuckRef.current = value;
    if (value) setUnseen(false);
  }, []);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    let lastTop = scroller.scrollTop;
    let lastHeight = scroller.scrollHeight;
    const onScroll = () => {
      const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      if (distance <= limit) stick(true);
      else if (scroller.scrollTop < lastTop) stick(false);
      lastTop = scroller.scrollTop;
    };
    const onWheel = (event: WheelEvent) => {
      // Ctrl + roda é a pinça de zoom do trackpad: a pessoa não rolou.
      if (event.deltaY < 0 && !event.ctrlKey && scroller.scrollTop > 0) stick(false);
    };
    // Cresceu o conteúdo ou mudou a altura da área: grudado, vai ao fim; solto, avisa se cresceu.
    // `lastTop` já muda aqui: o evento de scroll dessa ida ao fim só chega depois, e quem subir
    // antes dele tem de ser comparado com a posição nova.
    const observer = new ResizeObserver(() => {
      if (stuckRef.current) {
        scroller.scrollTop = scroller.scrollHeight;
        lastTop = scroller.scrollTop;
      } else if (scroller.scrollHeight > lastHeight) setUnseen(true);
      lastHeight = scroller.scrollHeight;
    });
    observer.observe(scroller);
    if (contentRef.current) observer.observe(contentRef.current);
    scroller.addEventListener("scroll", onScroll, { passive: true });
    scroller.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      observer.disconnect();
      scroller.removeEventListener("scroll", onScroll);
      scroller.removeEventListener("wheel", onWheel);
    };
  }, [limit, stick]);

  /** Volta ao fim e gruda. Sem animação para quem pediu menos movimento. O foco vai para a área
   * de rolagem (o botão que chamou some), de onde as setas continuam rolando. */
  const scrollToBottom = useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    stick(true);
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: still ? "auto" : "smooth" });
    scroller.focus({ preventScroll: true });
  }, [stick]);

  return { scrollRef, contentRef, unseen, scrollToBottom };
}

export type AutoScrollProps = { children: ReactNode; className?: string; threshold?: number };

/** Área de rolagem do chat que segue o fim enquanto o texto chega; quem subiu para ler não é
 * puxado de volta e ganha o botão "Novas mensagens" quando chega conteúdo abaixo. */
export function AutoScroll({ children, className, threshold }: AutoScrollProps) {
  const { scrollRef, contentRef, unseen, scrollToBottom } = useStickToBottom(threshold);
  return (
    <div className={cn("relative min-h-0", className)}>
      <div ref={scrollRef} tabIndex={-1} className="h-full overflow-y-auto">
        <div ref={contentRef}>{children}</div>
      </div>
      {unseen && <NewMessagesButton onClick={scrollToBottom} />}
    </div>
  );
}

/** O botão que volta ao fim quando chegou conteúdo com a pessoa lá em cima (área `relative`). */
export function NewMessagesButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="secondary"
      size="sm"
      className="-translate-x-1/2 absolute bottom-3 left-1/2 shadow-md"
      onClick={onClick}
    >
      <Icon name="expand" />
      Novas mensagens
    </Button>
  );
}
