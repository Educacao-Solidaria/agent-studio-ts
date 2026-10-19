/** Teto da pilha de desfazer: passou disso, a entrada mais antiga sai. */
export const HISTORY_LIMIT = 100;

/**
 * Histórico imutável no formato passado/presente/futuro. Cada operação devolve um objeto
 * novo e nunca altera o recebido: um snapshot guardado não muda depois de guardado.
 */
export type History<T> = {
  readonly past: readonly T[];
  readonly present: T;
  readonly future: readonly T[];
};

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

/** Ação nova: o presente vai para o passado (no máximo `limit` entradas) e o refazer some. */
export function record<T>(history: History<T>, next: T, limit = HISTORY_LIMIT): History<T> {
  // `slice(-0)` devolveria tudo: teto 0 (ou inválido) é histórico desligado.
  const past = limit > 0 ? [...history.past, history.present].slice(-limit) : [];
  return { past, present: next, future: [] };
}

/** Volta uma entrada; sem passado devolve o mesmo objeto (quem chama sabe que nada mudou). */
export function undo<T>(history: History<T>): History<T> {
  const { past, present, future } = history;
  if (past.length === 0) return history;
  return { past: past.slice(0, -1), present: past.at(-1) as T, future: [present, ...future] };
}

/** Avança uma entrada desfeita; sem futuro devolve o mesmo objeto. */
export function redo<T>(history: History<T>): History<T> {
  const { past, present, future } = history;
  if (future.length === 0) return history;
  return { past: [...past, present], present: future[0] as T, future: future.slice(1) };
}
