import type { NodeProps, NodeTypes } from "@xyflow/react";
import { memo } from "react";
import { DefaultNode } from "./default-node.tsx";
import type { NodeType } from "./domain.ts";
import { NODE_TYPES } from "./flow.ts";

/** Um arquivo de `canvas/nodes/`: o componente do nó como `export default`. */
export type NodeModule = { default?: NodeTypes[string] };

/**
 * Registro de nós visuais. Um tipo do contrato ganha componente próprio criando
 * `canvas/nodes/<tipo>.tsx` (ex.: `nodes/gateway.tsx`) com `export default` do componente,
 * tipado com `NodeProps<StudioFlowNode<GatewayNodeConfig, "gateway">>` — sem editar este
 * arquivo. Tipo sem arquivo usa o DefaultNode. Todo nó entra com `memo` (`sameNodeProps`). `<tipo>.test.tsx` e `<tipo>.stories.tsx` ao
 * lado são ignorados; outro `.tsx` auxiliar vai para subpasta (`nodes/gateway/…`): o glob é raso.
 */
const MOVING: ReadonlySet<string> = new Set(["positionAbsoluteX", "positionAbsoluteY"]);

/**
 * Comparação do memo de todo nó do registro: tudo menos a posição. No arraste o React Flow troca
 * `positionAbsoluteX/Y` a cada quadro e move o nó por fora (transform) — o desenho não muda, então
 * não renderiza. Nó visual que precise da posição lê com `useInternalNode(id)`.
 */
export function sameNodeProps(prev: NodeProps, next: NodeProps) {
  const keys = Object.keys(next) as Array<keyof NodeProps>;
  return (
    keys.length === Object.keys(prev).length &&
    keys.every((key) => MOVING.has(key) || Object.is(prev[key], next[key]))
  );
}

export function buildNodeTypes(modules: Record<string, NodeModule>): NodeTypes {
  const custom = new Map<string, NodeTypes[string]>();
  for (const [path, module] of Object.entries(modules)) {
    const type = path.slice(path.lastIndexOf("/") + 1, -".tsx".length);
    if (!NODE_TYPES.includes(type as NodeType) || !module.default) {
      // Arquivo com nome errado registraria um tipo que nenhum nó usa: falha alto, no load.
      throw new Error(
        `canvas/nodes: "${path}" deve se chamar <tipo>.tsx (${NODE_TYPES.join(", ")}) ` +
          "e exportar o componente como default",
      );
    }
    custom.set(type, module.default);
  }
  const component = (type: NodeType) => memo(custom.get(type) ?? DefaultNode, sameNodeProps);
  return Object.fromEntries(NODE_TYPES.map((type) => [type, component(type)]));
}

export const nodeTypes = buildNodeTypes(
  import.meta.glob<NodeModule>(["./nodes/*.tsx", "!./nodes/*.test.tsx", "!./nodes/*.stories.tsx"], {
    eager: true,
  }),
);
