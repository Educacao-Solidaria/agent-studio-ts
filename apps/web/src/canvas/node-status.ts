import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import type { NodeExecutionState, NodeStateMachine, NodeTransitionEvent } from "./domain.ts";

/** Quem emite as transições ao vivo: a `NodeStateMachine` do Luan (raiz `src/state`). */
export type ExecutionSource = Pick<NodeStateMachine, "subscribeDetailed">;

/** A execução de um nó como o canvas mostra. */
export type NodeStatus = { state: NodeExecutionState; error?: string; durationMs?: number };

/**
 * Estado de execução por nó, fora do estado do React Flow: uma transição troca o objeto
 * daquele nó e avisa só quem assina aquele id — nem o canvas nem os outros nós renderizam de
 * novo, e nada disso entra no desfazer.
 */
export function createStatusStore() {
  const statuses = new Map<string, NodeStatus>();
  // ponytail: o Set de um id que saiu do canvas fica vazio no mapa (um por id já visto).
  const listeners = new Map<string, Set<() => void>>();
  return {
    get: (id: string) => statuses.get(id),
    apply: ({ nodeId, to, error, durationMs }: NodeTransitionEvent) => {
      // O erro só vale enquanto o nó está em erro; a duração é a da última execução medida.
      const lastDuration = durationMs ?? statuses.get(nodeId)?.durationMs;
      const status = { state: to, error: to === "error" ? error : undefined };
      statuses.set(nodeId, { ...status, durationMs: lastDuration });
      for (const listener of listeners.get(nodeId) ?? []) listener();
    },
    subscribe: (id: string, listener: () => void) => {
      const forNode = listeners.get(id) ?? new Set();
      listeners.set(id, forNode.add(listener));
      return () => void forNode.delete(listener);
    },
  };
}

export type StatusStore = ReturnType<typeof createStatusStore>;

const StatusContext = createContext<StatusStore | null>(null);
export const StatusProvider = StatusContext.Provider;

/**
 * A execução ao vivo de um nó, assinada só para ele (`useSyncExternalStore` por id). Antes da
 * primeira transição é `undefined`, e quem chama usa o que o contrato trouxe no nó.
 */
export function useLiveStatus(id: string): NodeStatus | undefined {
  const store = useContext(StatusContext);
  const subscribe = useCallback(
    (onChange: () => void) => store?.subscribe(id, onChange) ?? (() => {}),
    [store, id],
  );
  const snapshot = () => store?.get(id);
  // O mesmo snapshot no servidor (renderToStaticMarkup): store vazio, vale o contrato.
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
