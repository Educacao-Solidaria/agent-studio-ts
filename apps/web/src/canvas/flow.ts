import type { Edge, Node } from "@xyflow/react";
import type { NodeExecutionState, NodeType, StudioEdge, StudioNode } from "./domain.ts";

/** Nome de cada tipo de nó na interface; o `satisfies` obriga a cobrir todo NodeType do contrato. */
export const NODE_LABELS = {
  gateway: "Gateway",
  cache: "Cache semântico",
  rag: "RAG híbrido",
  prompt: "Prompt",
  eval: "Avaliação",
  custom: "Personalizado",
} as const satisfies Record<NodeType, string>;

/** Todos os tipos de nó do contrato, em runtime. */
export const NODE_TYPES = Object.keys(NODE_LABELS) as NodeType[];

/** Enquadra todos os nós (abertura, controles, Organizar) sem ampliar um fluxo pequeno além de 100%. */
export const FIT_VIEW = { padding: 0.2, maxZoom: 1 };

/** Cor de cada estado de execução (tokens do tema): pontas da aresta e nós do mini-mapa. */
export const STATE_COLORS: Record<NodeExecutionState, string> = {
  idle: "var(--color-muted-foreground)",
  queued: "var(--color-warning)",
  running: "var(--color-primary)",
  success: "var(--color-success)",
  error: "var(--color-danger)",
};

/**
 * O que cada nó visual recebe em `data`: o StudioNode sem id, tipo e posição, que o
 * React Flow já carrega no próprio nó. `TConfig` tipa a configuração (ex.: GatewayNodeConfig).
 */
export type StudioNodeData<TConfig = StudioNode["data"]> = Pick<
  StudioNode,
  "state" | "error" | "lastExecutionDurationMs"
> & {
  /** Configuração específica do tipo: o `data` do StudioNode. */
  config: TConfig;
};

export type StudioFlowNode<TConfig = StudioNode["data"], TType extends NodeType = NodeType> = Node<
  StudioNodeData<TConfig>,
  TType
>;

/** Id novo e legível para um nó do tipo: o próprio tipo, se livre; senão `rag-2`, `rag-3`… */
export function nextNodeId(type: NodeType, taken: ReadonlySet<string>) {
  let id: string = type;
  for (let n = 2; taken.has(id); n++) id = `${type}-${n}`;
  return id;
}

/** StudioNode (contrato de domínio) → nó do React Flow. */
export function toFlowNode({ id, type, position, data, ...execution }: StudioNode): StudioFlowNode {
  return { id, type, position, data: { ...execution, config: data } };
}

/** `active` força o indicador de fluxo ativo da aresta, com ou sem nós executando. */
export type StudioFlowEdge = Edge<{ active?: boolean }>;

/** Nome acessível da aresta (o padrão do React Flow é "Edge from a to b", em inglês). */
export function edgeAriaLabel(source: string, target: string) {
  return `Conexão de ${source} para ${target}`;
}

/**
 * StudioEdge → aresta do React Flow. O `animated` do contrato vira `data.active`: no
 * `animated` do React Flow entraria a animação dele, que ignora prefers-reduced-motion.
 */
export function toFlowEdge({ animated, ...edge }: StudioEdge): StudioFlowEdge {
  return {
    ...edge,
    data: { active: animated === true },
    ariaLabel: edgeAriaLabel(edge.source, edge.target),
  };
}
