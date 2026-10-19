import type { StudioEdge, StudioNode } from "./domain.ts";

/**
 * Fluxo com que o app abre. ponytail: sem persistência nem paleta de nós ainda, o canvas
 * não tem de onde carregar um fluxo; quando o serializador do Luan chegar à interface, sai.
 */
export const sampleNodes: StudioNode[] = [
  { id: "prompt", type: "prompt", position: { x: 0, y: 80 }, state: "success", data: {} },
  { id: "cache", type: "cache", position: { x: 280, y: 0 }, state: "success", data: {} },
  { id: "rag", type: "rag", position: { x: 280, y: 160 }, state: "running", data: {} },
  { id: "gateway", type: "gateway", position: { x: 560, y: 80 }, state: "queued", data: {} },
  { id: "eval", type: "eval", position: { x: 840, y: 80 }, state: "idle", data: {} },
];

export const sampleEdges: StudioEdge[] = [
  { id: "prompt-cache", source: "prompt", target: "cache" },
  { id: "prompt-rag", source: "prompt", target: "rag" },
  { id: "cache-gateway", source: "cache", target: "gateway" },
  { id: "rag-gateway", source: "rag", target: "gateway", animated: true },
  { id: "gateway-eval", source: "gateway", target: "eval" },
];
