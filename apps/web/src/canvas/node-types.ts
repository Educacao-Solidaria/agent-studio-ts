import type { NodeTypes } from "@xyflow/react";
import { DefaultNode } from "./default-node.tsx";
import type { NodeType } from "./domain.ts";
import { NODE_TYPES } from "./flow.ts";

/** Um arquivo de `canvas/nodes/`: o componente do nó como `export default`. */
export type NodeModule = { default?: NodeTypes[string] };

/**
 * Registro de nós visuais. Um tipo do contrato ganha componente próprio criando
 * `canvas/nodes/<tipo>.tsx` (ex.: `nodes/gateway.tsx`) com `export default` do componente,
 * tipado com `NodeProps<StudioFlowNode<GatewayNodeConfig, "gateway">>` — sem editar este
 * arquivo. Tipo sem arquivo usa o DefaultNode. `<tipo>.test.tsx` e `<tipo>.stories.tsx` ao
 * lado são ignorados; outro `.tsx` auxiliar vai para subpasta (`nodes/gateway/…`): o glob é raso.
 */
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
  return Object.fromEntries(NODE_TYPES.map((type) => [type, custom.get(type) ?? DefaultNode]));
}

export const nodeTypes = buildNodeTypes(
  import.meta.glob<NodeModule>(["./nodes/*.tsx", "!./nodes/*.test.tsx", "!./nodes/*.stories.tsx"], {
    eager: true,
  }),
);
