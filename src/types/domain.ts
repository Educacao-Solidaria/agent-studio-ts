/**
 * Tipos de nós suportados no canvas visual do Studio.
 */
export type NodeType =
  | 'gateway'
  | 'cache'
  | 'rag'
  | 'prompt'
  | 'eval'
  | 'custom';

/**
 * Estados do ciclo de vida de execução de um nó.
 */
export type NodeExecutionState =
  | 'idle'
  | 'queued'
  | 'running'
  | 'success'
  | 'error';

/**
 * Representação de um nó no canvas do Agent Studio.
 */
export interface StudioNode<TData = Record<string, unknown>> {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  state: NodeExecutionState;
  data: TData;
  error?: string;
  lastExecutionDurationMs?: number;
}

/**
 * Conexão direcionada entre dois nós no grafo.
 */
export interface StudioEdge {
  id: string;
  source: string;
  sourceHandle?: string;
  target: string;
  targetHandle?: string;
  animated?: boolean;
}

/**
 * Papéis de mensagem para o histórico de chat e fluxo.
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * Estrutura de Tool Call emitida por modelos OpenRouter.
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Mensagem trocada no chat interativo.
 */
export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  timestamp: number;
  metadata?: {
    model?: string;
    cached?: boolean;
    ttftMs?: number;
    totalTokens?: number;
  };
}
