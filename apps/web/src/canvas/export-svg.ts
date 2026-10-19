import {
  getBezierPath,
  type Handle,
  type InternalNode,
  type ReactFlowInstance,
} from "@xyflow/react";
import { FALLBACK_SIZE } from "./auto-layout.ts";
import { STATES } from "./default-node.tsx";
import type { NodeExecutionState } from "./domain.ts";
import { NODE_LABELS, STATE_COLORS, type StudioFlowEdge, type StudioFlowNode } from "./flow.ts";
import { isTransmitting } from "./flow-edge.tsx";
import type { StatusStore } from "./node-status.ts";

type Point = { x: number; y: number };
type States = [from: NodeExecutionState, to: NodeExecutionState];
type Box = Point & { width: number; height: number };

/** O fluxo como a imagem o desenha: só nós e arestas, em coordenadas do fluxo, com o estado. */
export type Scene = {
  nodes: Array<{ box: Box; label: string; state: NodeExecutionState; ports: Box[] }>;
  edges: Array<{ path: string; start: Point; end: Point; states: States; active: boolean }>;
};
type Flow = ReactFlowInstance<StudioFlowNode, StudioFlowEdge>;
type FlowNode = InternalNode<StudioFlowNode>;

/** Onde a aresta encosta na porta, em fração da caixa da porta por lado (a conta do React Flow). */
const SIDE = { left: [0, 0.5], right: [1, 0.5], top: [0.5, 0], bottom: [0.5, 1] } as const;

function anchor(node: FlowNode, handle: Handle): Point {
  const [fx, fy] = SIDE[handle.position];
  const { x, y } = node.internals.positionAbsolute;
  return { x: x + handle.x + handle.width * fx, y: y + handle.y + handle.height * fy };
}

function portOf(node: FlowNode, type: Handle["type"], id?: string | null) {
  const handles = node.internals.handleBounds?.[type] ?? [];
  return id ? handles.find((handle) => handle.id === id) : handles[0];
}

/** Nós e arestas do canvas agora, com o estado ao vivo da execução (ou, antes dela, o do contrato). */
export function sceneOf(flow: Flow, statuses: StatusStore | null): Scene {
  const placed = new Map<string, FlowNode>();
  for (const { id } of flow.getNodes()) {
    const node = flow.getInternalNode(id);
    const at = node?.internals.positionAbsolute;
    // Posição inválida (NaN) estragaria o viewBox da imagem inteira: esse nó fica de fora.
    if (node && at && Number.isFinite(at.x) && Number.isFinite(at.y)) placed.set(id, node);
  }
  const stateOf = (node: StudioFlowNode) => statuses?.get(node.id)?.state ?? node.data.state;
  const nodes = [...placed.values()].map((node) => {
    const { x, y } = node.internals.positionAbsolute;
    const handles = node.internals.handleBounds;
    const width = node.measured.width ?? FALLBACK_SIZE.width;
    const height = node.measured.height ?? FALLBACK_SIZE.height;
    return {
      box: { x, y, width, height },
      label: node.type ? NODE_LABELS[node.type] : "",
      state: stateOf(node),
      ports: [...(handles?.source ?? []), ...(handles?.target ?? [])].map((handle) => ({
        ...handle,
        x: x + handle.x,
        y: y + handle.y,
      })),
    };
  });
  // Como no canvas, aresta sem um dos nós ou sem a porta não é desenhada.
  const edges = flow.getEdges().flatMap((edge) => {
    const source = placed.get(edge.source);
    const target = placed.get(edge.target);
    const out = source && portOf(source, "source", edge.sourceHandle);
    const into = target && portOf(target, "target", edge.targetHandle);
    if (!source || !target || !out || !into) return [];
    const start = anchor(source, out);
    const end = anchor(target, into);
    const [path] = getBezierPath({
      sourceX: start.x,
      sourceY: start.y,
      sourcePosition: out.position,
      targetX: end.x,
      targetY: end.y,
      targetPosition: into.position,
    });
    const states: States = [stateOf(source), stateOf(target)];
    // Ativa como na FlowEdge: marcada no contrato ou com dado em trânsito agora.
    const active = edge.data?.active === true || isTransmitting(...states);
    return [{ path, start, end, states, active }];
  });
  return { nodes, edges };
}

const SVG = "http://www.w3.org/2000/svg";
/** Margem em volta dos nós, em px. */
export const PADDING = 24;

function element(name: string, attributes: Record<string, string | number>, text?: string) {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Caixa que contém todas as caixas; sem nenhuma, a origem. */
function bounds(boxes: Box[]) {
  if (boxes.length === 0) return { left: 0, top: 0, right: 0, bottom: 0 };
  let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const { x, y, width, height } of boxes) {
    [left, top] = [Math.min(left, x), Math.min(top, y)];
    [right, bottom] = [Math.max(right, x + width), Math.max(bottom, y + height)];
  }
  return { left, top, right, bottom };
}

/**
 * O SVG do fluxo, em texto. Montado pela API do DOM: o que vier do usuário só entra como texto
 * ou valor de atributo, que o XMLSerializer escapa. Sem script, foreignObject, link nem CSS: só
 * formas, com as cores já resolvidas por `resolve` (`var(--token)` → o valor do tema de agora).
 */
export function renderSvg({ nodes, edges }: Scene, resolve: (value: string) => string) {
  const area = bounds(nodes.map((node) => node.box));
  const [x, y] = [area.left - PADDING, area.top - PADDING];
  const [width, height] = [area.right - x + PADDING, area.bottom - y + PADDING];
  const color = (token: string) => resolve(`var(--color-${token})`);
  const svg = element("svg", {
    width,
    height,
    viewBox: `${x} ${y} ${width} ${height}`,
    role: "img",
    "font-family": resolve("var(--font-sans)"),
  });
  const defs = element("defs", {});
  svg.append(element("title", {}, "Fluxo do Agent Studio"), defs);
  svg.append(element("rect", { x, y, width, height, fill: color("background") }));

  edges.forEach(({ path, start, end, states, active }, i) => {
    // Gradiente da cor da origem para a do destino, como a FlowEdge. O id é gerado aqui, nunca
    // o da aresta: nada do usuário vira referência url(#…).
    const gradient = element("linearGradient", {
      id: `edge-${i}`,
      gradientUnits: "userSpaceOnUse",
      ...{ x1: start.x, y1: start.y, x2: end.x, y2: end.y },
    });
    states.forEach((state, offset) => {
      gradient.append(element("stop", { offset, "stop-color": resolve(STATE_COLORS[state]) }));
    });
    defs.append(gradient);
    const stroke = { stroke: `url(#edge-${i})`, "stroke-width": active ? 2.5 : 1.5 };
    svg.append(element("path", { d: path, fill: "none", ...stroke }));
  });

  for (const { box, label, state, ports } of nodes) {
    const node = element("g", {});
    const border = color(state === "error" ? "danger" : "border");
    node.append(element("rect", { ...box, rx: 8, fill: color("surface"), stroke: border }));
    const row = { y: box.y + 20, "dominant-baseline": "central", "font-weight": 500 };
    const title = { ...row, x: box.x + 12, "font-size": 14, fill: color("surface-foreground") };
    node.append(element("text", title, label));
    // Selo do estado, nas cores do Badge. ponytail: largura estimada por caractere (Inter 12 px);
    // medir o texto exigiria a imagem montada no documento (getComputedTextLength).
    const { label: name, variant } = STATES[state];
    const token = variant && variant !== "neutral" ? variant : "muted";
    const pill = { width: name.length * 7 + 16, height: 20, rx: 4 };
    const left = box.x + box.width - 12 - pill.width;
    node.append(element("rect", { ...pill, x: left, y: box.y + 10, fill: color(token) }));
    const badge = { ...row, x: left + pill.width / 2, "text-anchor": "middle", "font-size": 12 };
    node.append(element("text", { ...badge, fill: color(`${token}-foreground`) }, name));
    for (const port of ports) {
      const center = { cx: port.x + port.width / 2, cy: port.y + port.height / 2 };
      const dot = { ...center, r: port.width / 2, stroke: color("surface") };
      node.append(element("circle", { ...dot, fill: color("muted-foreground") }));
    }
    svg.append(node);
  }
  return new XMLSerializer().serializeToString(svg);
}

/** Nome previsível e sem nada do usuário: `fluxo-AAAA-MM-DD.svg`, na data local. */
export function exportFileName(now: Date) {
  const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()];
  return `fluxo-${date.map((part) => String(part).padStart(2, "0")).join("-")}.svg`;
}

/** Baixa o fluxo do canvas como SVG, nas cores do tema que vale em `canvas` agora. */
export function exportFlowSvg(flow: Flow, statuses: StatusStore | null, canvas: Element) {
  const style = getComputedStyle(canvas);
  // `--color-x` é só `var(--x)` (@theme inline) e o Tailwind não emite os que nenhuma regra usa
  // (os `-foreground` do Badge, por exemplo): lê o token cru, que o globals.css define nos 2 temas.
  const resolve = (value: string) =>
    value.replace(/var\(--(?:color-)?([\w-]+)\)/g, (_, name: string) =>
      style.getPropertyValue(`--${name}`).trim(),
    );
  const svg = renderSvg(sceneOf(flow, statuses), resolve);
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = exportFileName(new Date());
  document.body.append(link);
  link.click();
  link.remove();
  // Revogar já no clique cancela o download em alguns navegadores; o FileSaver.js espera 40 s.
  setTimeout(() => URL.revokeObjectURL(url), 40_000);
}
