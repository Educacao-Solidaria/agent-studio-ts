/**
 * Contrato de domínio do Luan (raiz `src/types`), re-exportado num ponto só do apps/web.
 * Só tipos: `export type` é apagado no build, então o bundle não leva nada da raiz.
 */
export type {
  NodeExecutionState,
  NodeType,
  StudioEdge,
  StudioNode,
} from "../../../../src/types/domain.ts";
export type {
  CacheNodeConfig,
  EvalNodeConfig,
  GatewayNodeConfig,
  PromptNodeConfig,
  RagNodeConfig,
} from "../../../../src/types/nodes.ts";
