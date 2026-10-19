import type { NodeType } from "./domain.ts";

/** Tipo do dado que passa numa porta; `any` liga com qualquer outro. */
export type PortType = "text" | "documents" | "any";

export const PORT_TYPE_LABELS: Record<PortType, string> = {
  text: "texto",
  documents: "documentos",
  any: "qualquer dado",
};

export type Port = { id: string; label: string; type: PortType };
export type NodePorts = { inputs: Port[]; outputs: Port[] };

/**
 * Portas de entrada (esquerda) e saída (direita) de cada tipo de nó. O contrato da raiz ainda
 * não define portas: este é o encaixe mínimo do apps/web. Um nó visual próprio
 * (`canvas/nodes/<tipo>.tsx`) usa estes ids nos `Handle`, ou o validador não reconhece a porta.
 */
export const NODE_PORTS: Record<NodeType, NodePorts> = {
  prompt: { inputs: [], outputs: [{ id: "prompt", label: "Prompt", type: "text" }] },
  cache: {
    inputs: [{ id: "query", label: "Consulta", type: "text" }],
    outputs: [{ id: "response", label: "Resposta", type: "text" }],
  },
  rag: {
    inputs: [{ id: "query", label: "Consulta", type: "text" }],
    outputs: [{ id: "context", label: "Contexto", type: "documents" }],
  },
  gateway: {
    inputs: [
      { id: "prompt", label: "Prompt", type: "text" },
      { id: "context", label: "Contexto", type: "documents" },
    ],
    outputs: [{ id: "completion", label: "Resposta do modelo", type: "text" }],
  },
  eval: { inputs: [{ id: "response", label: "Resposta", type: "text" }], outputs: [] },
  custom: {
    inputs: [{ id: "in", label: "Entrada", type: "any" }],
    outputs: [{ id: "out", label: "Saída", type: "any" }],
  },
};
