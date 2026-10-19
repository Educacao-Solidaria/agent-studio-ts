import type { StudioEdge, StudioNode } from "./domain.ts";

/**
 * Fluxo com que o app abre. ponytail: sem persistência nem paleta de nós ainda, o canvas
 * não tem de onde carregar um fluxo; quando o serializador do Luan chegar à interface, sai.
 */
export const sampleNodes: StudioNode[] = [
  { id: "prompt", type: "prompt", position: { x: 0, y: 80 }, state: "success", data: {} },
  { id: "cache", type: "cache", position: { x: 280, y: 0 }, state: "success", data: {} },
  { id: "rag", type: "rag", position: { x: 280, y: 160 }, state: "success", data: {} },
  { id: "gateway", type: "gateway", position: { x: 560, y: 80 }, state: "running", data: {} },
  { id: "eval", type: "eval", position: { x: 840, y: 80 }, state: "queued", data: {} },
];

/** Portas pelos ids de NODE_PORTS: o RAG entra no contexto do gateway, o cache no prompt. */
const link = (source: string, sourceHandle: string, target: string, targetHandle: string) => ({
  id: `${source}-${target}`,
  source,
  sourceHandle,
  target,
  targetHandle,
});

export const sampleEdges: StudioEdge[] = [
  link("prompt", "prompt", "cache", "query"),
  link("prompt", "prompt", "rag", "query"),
  link("cache", "response", "gateway", "prompt"),
  link("rag", "context", "gateway", "context"),
  link("gateway", "completion", "eval", "response"),
];
