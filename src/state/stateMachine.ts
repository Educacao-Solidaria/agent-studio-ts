import type { NodeExecutionState } from '../types/domain.ts';

/**
 * Matriz de transições permitidas para a máquina de estados de execução do nó.
 */
export const VALID_TRANSITIONS: Record<
  NodeExecutionState,
  NodeExecutionState[]
> = {
  idle: ['queued', 'running'],
  queued: ['running', 'idle', 'error'],
  running: ['success', 'error'],
  success: ['idle', 'queued', 'running'],
  error: ['idle', 'queued', 'running'],
};

export interface StateMachineListener {
  (nodeId: string, from: NodeExecutionState, to: NodeExecutionState): void;
}

/**
 * Controlador de máquina de estados para execução determinística de nós no Studio.
 */
export class NodeStateMachine {
  private states = new Map<string, NodeExecutionState>();
  private listeners: StateMachineListener[] = [];

  constructor(initialStates?: Record<string, NodeExecutionState>) {
    if (initialStates) {
      for (const [id, state] of Object.entries(initialStates)) {
        this.states.set(id, state);
      }
    }
  }

  /**
   * Obtém o estado atual de um nó. Retorna 'idle' se não registrado.
   */
  getState(nodeId: string): NodeExecutionState {
    return this.states.get(nodeId) ?? 'idle';
  }

  /**
   * Transiciona o estado de um nó de forma validada e emite evento aos listeners.
   */
  transition(nodeId: string, toState: NodeExecutionState): boolean {
    const currentState = this.getState(nodeId);
    if (currentState === toState) {
      return true; // No-op
    }

    const allowed = VALID_TRANSITIONS[currentState];
    if (!allowed || !allowed.includes(toState)) {
      throw new Error(
        `Transição inválida para o nó "${nodeId}": de "${currentState}" para "${toState}"`
      );
    }

    this.states.set(nodeId, toState);
    for (const listener of this.listeners) {
      listener(nodeId, currentState, toState);
    }
    return true;
  }

  /**
   * Registra um listener para observar alterações de estado dos nós.
   */
  subscribe(listener: StateMachineListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Reinicia todos os nós para o estado 'idle'.
   */
  resetAll(): void {
    for (const id of this.states.keys()) {
      this.transition(id, 'idle');
    }
  }
}
