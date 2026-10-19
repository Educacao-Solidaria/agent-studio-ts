import type { NodeType } from "./domain.ts";
import { NODE_PORTS, type NodePorts, PORT_TYPE_LABELS, type Port, type PortType } from "./ports.ts";

/** Uma ligação de saída (source) para entrada (target), como o React Flow a entrega. */
export type Link = {
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

export type GraphView = {
  nodes: ReadonlyArray<{ id: string; type?: string }>;
  edges: ReadonlyArray<Link>;
};

export type Refusal =
  | { reason: "self" | "missing" | "duplicate" | "cycle" }
  | { reason: "incompatible"; from: PortType; to: PortType };

const NO_PORTS: NodePorts = { inputs: [], outputs: [] };

/** Porta pelo id do handle; sem id, a primeira do lado — a mesma que o React Flow usa. */
function findPort(ports: Port[], handleId?: string | null) {
  return handleId ? ports.find((port) => port.id === handleId) : ports[0];
}

const sameLink = (a: Link, b: Link) =>
  a.source === b.source &&
  a.target === b.target &&
  (a.sourceHandle ?? null) === (b.sourceHandle ?? null) &&
  (a.targetHandle ?? null) === (b.targetHandle ?? null);

/** `to` é alcançável a partir de `from` pelas arestas? Iterativo: grafo grande não estoura a pilha. */
function reaches(edges: GraphView["edges"], from: string, to: string) {
  const next = new Map<string, string[]>();
  for (const { source, target } of edges) {
    const targets = next.get(source);
    if (targets) targets.push(target);
    else next.set(source, [target]);
  }
  const seen = new Set<string>();
  const stack = [from];
  for (let id = stack.pop(); id !== undefined; id = stack.pop()) {
    if (id === to) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const target of next.get(id) ?? []) stack.push(target);
  }
  return false;
}

/**
 * Por que a ligação seria recusada, ou `null` se ela pode entrar: nó ligado a ele mesmo,
 * porta que o tipo do nó não tem, ligação repetida, tipos de dado incompatíveis ou um ciclo
 * (o destino já alcança a origem, e o grafo de execução tem de ser um DAG). Puro: é o que o
 * `isValidConnection` do canvas consulta, e se testa sem React.
 */
export function refuseConnection(link: Link, graph: GraphView): Refusal | null {
  if (link.source === link.target) return { reason: "self" };
  const portsOf = (id: string) => {
    const type = graph.nodes.find((node) => node.id === id)?.type;
    // hasOwn: um tipo vindo de fora como "constructor" não pode achar o protótipo do objeto.
    return type && Object.hasOwn(NODE_PORTS, type) ? NODE_PORTS[type as NodeType] : NO_PORTS;
  };
  const from = findPort(portsOf(link.source).outputs, link.sourceHandle);
  const to = findPort(portsOf(link.target).inputs, link.targetHandle);
  if (!from || !to) return { reason: "missing" };
  if (graph.edges.some((edge) => sameLink(edge, link))) return { reason: "duplicate" };
  if (from.type !== to.type && from.type !== "any" && to.type !== "any") {
    return { reason: "incompatible", from: from.type, to: to.type };
  }
  if (reaches(graph.edges, link.target, link.source)) return { reason: "cycle" };
  return null;
}

/** O motivo da recusa em pt-BR, para o aviso no canvas. */
export function refusalMessage(refusal: Refusal): string {
  switch (refusal.reason) {
    case "self":
      return "Um nó não pode se ligar a ele mesmo.";
    case "missing":
      return "Essa porta não existe neste tipo de nó.";
    case "duplicate":
      return "Essas portas já estão ligadas.";
    case "cycle":
      return "Essa ligação fecharia um ciclo: o fluxo voltaria a um nó anterior.";
    case "incompatible":
      return `Saída de ${PORT_TYPE_LABELS[refusal.from]} não liga em entrada de ${PORT_TYPE_LABELS[refusal.to]}.`;
  }
}
