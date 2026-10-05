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

export interface NodeTransitionEvent {
  nodeId: string;
  from: NodeExecutionState;
  to: NodeExecutionState;
  timestamp: number;
  durationMs?: number;
  error?: string;
}

export type StateMachineListener = (
  nodeId: string,
  from: NodeExecutionState,
  to: NodeExecutionState
) => void;

export type DetailedTransitionListener = (event: NodeTransitionEvent) => void;

/**
 * Controlador avançado de máquina de estados para execução de nós com temporizadores e métricas.
 */
export class NodeStateMachine {
  private states = new Map<string, NodeExecutionState>();
  private startTimes = new Map<string, number>();
  private lastDurations = new Map<string, number>();
  private timers = new Map<string, NodeJS.Timeout>();
  private history = new Map<string, NodeTransitionEvent[]>();

  private simpleListeners: StateMachineListener[] = [];
  private detailedListeners: DetailedTransitionListener[] = [];

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
   * Obtém a última duração de execução medida em milissegundos.
   */
  getExecutionDuration(nodeId: string): number | undefined {
    return this.lastDurations.get(nodeId);
  }

  /**
   * Retorna o histórico de eventos de transição registrados para o nó.
   */
  getHistory(nodeId: string): NodeTransitionEvent[] {
    return this.history.get(nodeId) || [];
  }

  /**
   * Agenda um timeout para o nó. Se o nó não concluir antes do prazo, transiciona para 'error'.
   */
  setTimeout(nodeId: string, timeoutMs: number): void {
    this.clearTimeout(nodeId);
    const timer = globalThis.setTimeout(() => {
      if (this.getState(nodeId) === 'running') {
        this.transition(nodeId, 'error', `Timeout de execucao excedido (${timeoutMs}ms)`);
      }
    }, timeoutMs);
    this.timers.set(nodeId, timer);
  }

  public clearTimeout(nodeId: string): void {
    const timer = this.timers.get(nodeId);
    if (timer) {
      globalThis.clearTimeout(timer);
      this.timers.delete(nodeId);
    }
  }

  /**
   * Transiciona o estado de um nó de forma validada, calculando métricas de tempo.
   */
  transition(
    nodeId: string,
    toState: NodeExecutionState,
    errorMessage?: string
  ): boolean {
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

    const now = Date.now();
    let durationMs: number | undefined;

    if (toState === 'running') {
      this.startTimes.set(nodeId, now);
    } else if (currentState === 'running' && (toState === 'success' || toState === 'error')) {
      this.clearTimeout(nodeId);
      const startTime = this.startTimes.get(nodeId);
      if (startTime) {
        durationMs = now - startTime;
        this.lastDurations.set(nodeId, durationMs);
        this.startTimes.delete(nodeId);
      }
    }

    this.states.set(nodeId, toState);

    const event: NodeTransitionEvent = {
      nodeId,
      from: currentState,
      to: toState,
      timestamp: now,
      durationMs,
      error: errorMessage,
    };

    if (!this.history.has(nodeId)) {
      this.history.set(nodeId, []);
    }
    this.history.get(nodeId)!.push(event);

    // Notifica listeners simples
    for (const listener of this.simpleListeners) {
      listener(nodeId, currentState, toState);
    }

    // Notifica listeners detalhados
    for (const listener of this.detailedListeners) {
      listener(event);
    }

    return true;
  }

  /**
   * Registra um listener simples compatível com a interface original.
   */
  subscribe(listener: StateMachineListener): () => void {
    this.simpleListeners.push(listener);
    return () => {
      this.simpleListeners = this.simpleListeners.filter((l) => l !== listener);
    };
  }

  /**
   * Registra um listener com telemetria e métricas detalhadas.
   */
  subscribeDetailed(listener: DetailedTransitionListener): () => void {
    this.detailedListeners.push(listener);
    return () => {
      this.detailedListeners = this.detailedListeners.filter((l) => l !== listener);
    };
  }

  /**
   * Reinicia todos os nós para o estado 'idle' limpando timers pendentes.
   */
  resetAll(): void {
    for (const id of this.states.keys()) {
      this.clearTimeout(id);
      this.transition(id, 'idle');
    }
  }
}
