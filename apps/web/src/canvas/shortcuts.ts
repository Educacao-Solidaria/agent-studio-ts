import { useEffect, useEffectEvent } from "react";

/**
 * Atalhos do canvas num mapa só: o teclado, o `aria-keyshortcuts` e a dica dos botões saem
 * daqui. "Mod" é Ctrl ou Cmd e os dois valem em qualquer sistema: a dica "Ctrl+Z" é
 * verdadeira também no Mac, e no Windows Win+letra já é do sistema operacional.
 */
export const SHORTCUTS = {
  undo: { label: "Desfazer", keys: ["Mod+Z"] },
  redo: { label: "Refazer", keys: ["Mod+Y", "Mod+Shift+Z"] },
} as const satisfies Record<string, { label: string; keys: readonly string[] }>;

export type ShortcutId = keyof typeof SHORTCUTS;

const IDS = Object.keys(SHORTCUTS) as ShortcutId[];

/** Valor de `aria-keyshortcuts`: cada "Mod" vira as duas formas, Control e Meta. */
export function ariaKeys(id: ShortcutId) {
  const forms = (combo: string) => ["Control", "Meta"].map((mod) => combo.replace("Mod", mod));
  return SHORTCUTS[id].keys.flatMap(forms).join(" ");
}

/** Dica visível, com a primeira combinação do mapa: "Ctrl+Z". */
export const keyHint = (id: ShortcutId) => SHORTCUTS[id].keys[0].replace("Mod", "Ctrl");

/** O atalho que o evento aciona. Alt fica de fora: AltGr chega como Ctrl+Alt e digita letra. */
export function shortcutOf(event: KeyboardEvent): ShortcutId | undefined {
  if (event.altKey || !(event.ctrlKey || event.metaKey)) return undefined;
  // Layout não latino (ex.: cirílico) põe outra letra em `key`; aí vale a tecla física.
  const letter = /^[a-z]$/i.test(event.key) ? event.key.toUpperCase() : event.code.slice(3);
  const combo = `Mod+${event.shiftKey ? "Shift+" : ""}${letter}`;
  return IDS.find((id) => (SHORTCUTS[id].keys as readonly string[]).includes(combo));
}

/** Mesma regra do React Flow para o Delete: em campo de texto ou `.nokey` a tecla é do elemento. */
const ownsKeyboard = (target: EventTarget | null) =>
  target instanceof Element &&
  target.closest("input, textarea, select, [contenteditable], .nokey") !== null;

/**
 * Liga os atalhos no documento, como o React Flow faz com o Delete: depois de apagar um nó o
 * foco cai no body, e o Ctrl+Z ainda tem de alcançar o canvas. Em campo de texto o Ctrl+Z
 * segue sendo o desfazer nativo do texto.
 */
export function useShortcuts(actions: Partial<Record<ShortcutId, () => void>>) {
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const id = shortcutOf(event);
    const action = id && actions[id];
    if (!action || event.defaultPrevented || ownsKeyboard(event.target)) return;
    event.preventDefault();
    action();
  });
  useEffect(() => {
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}
