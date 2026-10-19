import type { Node } from "@xyflow/react";
import type { NodeType, StudioNode } from "./domain.ts";

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

/** StudioNode (contrato de domínio) → nó do React Flow. */
export function toFlowNode({ id, type, position, data, ...execution }: StudioNode): StudioFlowNode {
  return { id, type, position, data: { ...execution, config: data } };
}
