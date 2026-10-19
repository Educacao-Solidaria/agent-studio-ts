import { BaseEdge, type EdgeProps, getBezierPath, useNodesData } from "@xyflow/react";
import { type CSSProperties, useId } from "react";
import type { NodeExecutionState } from "./domain.ts";
import { STATE_COLORS, type StudioFlowEdge, type StudioFlowNode } from "./flow.ts";
import { useLiveStatus } from "./node-status.ts";

/**
 * Há dado em trânsito quando o destino está executando e a origem já entregou a saída
 * (concluída) ou ainda a produz (executando, em streaming). Origem executando com o destino na
 * fila ou ocioso ainda não mandou nada; origem com erro não manda.
 */
export function isTransmitting(source?: NodeExecutionState, target?: NodeExecutionState) {
  return target === "running" && (source === "success" || source === "running");
}

/** Velocidade do pulso, em px do fluxo por segundo: aresta longa leva mais tempo, não corre mais. */
const PULSE_SPEED = 240;

/**
 * Duração de uma volta do pulso, em ms, entre 0,6 s e 3 s. ponytail: o comprimento vem da corda
 * entre as pontas (numa curva fechada, até ~1/4 menor que o caminho); medir de verdade pediria
 * `getTotalLength()` no DOM a cada render da aresta.
 */
export function pulseDuration(sourceX: number, sourceY: number, targetX: number, targetY: number) {
  const ms = (Math.hypot(targetX - sourceX, targetY - sourceY) / PULSE_SPEED) * 1000;
  return Number.isFinite(ms) ? Math.min(3000, Math.max(600, Math.round(ms))) : 1200;
}

/**
 * Aresta do estúdio: gradiente da cor do estado da origem para a do destino, atualizado ao
 * vivo, e, com fluxo ativo, linha mais grossa com traços correndo no sentido do dado e um pulso
 * (uma seta) andando da origem ao destino em velocidade constante. Com prefers-reduced-motion os
 * traços param e a seta fica no meio da aresta, apontando para o destino: o "ativo" e o sentido
 * continuam visíveis, sem movimento.
 */
export function FlowEdge(props: EdgeProps<StudioFlowEdge>) {
  const { source, target, data, sourceX, sourceY, targetX, targetY } = props;
  const [path] = getBezierPath(props);
  // Id único por aresta: com id repetido, todas pintariam com o gradiente da primeira.
  const gradientId = `flow-edge-${useId()}`;
  const fromData = useNodesData<StudioFlowNode>(source)?.data.state;
  const toData = useNodesData<StudioFlowNode>(target)?.data.state;
  // Estado ao vivo da execução (assinado por nó) e, antes dela, o do contrato.
  const from = useLiveStatus(source)?.state ?? fromData ?? "idle";
  const to = useLiveStatus(target)?.state ?? toData ?? "idle";
  const active = data?.active === true || isTransmitting(from, to);

  return (
    <>
      <defs>
        <linearGradient
          id={gradientId}
          gradientUnits="userSpaceOnUse"
          x1={sourceX}
          y1={sourceY}
          x2={targetX}
          y2={targetY}
        >
          <stop offset="0" style={{ stopColor: STATE_COLORS[from] }} />
          <stop offset="1" style={{ stopColor: STATE_COLORS[to] }} />
        </linearGradient>
      </defs>
      <BaseEdge
        path={path}
        markerEnd={props.markerEnd}
        // O gradiente vai por variável, não por `stroke` inline: assim a cor de seleção e a de
        // foco do teclado (regras do React Flow, mais específicas) ainda vencem — ver globals.css.
        style={
          {
            "--flow-edge-stroke": `url(#${gradientId})`,
            strokeWidth: active ? 2.5 : 1.5,
          } as CSSProperties
        }
      />
      {active && (
        <>
          <path
            d={path}
            data-flow="active"
            className="pointer-events-none animate-flow-dash fill-none stroke-2 stroke-surface [stroke-dasharray:4_12]"
          />
          {/* Motion Path do CSS no caminho da própria aresta: o navegador anima, sem JS por quadro. */}
          <path
            d="M -6 -5 L 6 0 L -6 5 Z"
            data-flow="pulse"
            className="flow-pulse pointer-events-none animate-flow-pulse fill-primary stroke-surface"
            style={
              {
                "--flow-pulse-path": `path("${path}")`,
                animationDuration: `${pulseDuration(sourceX, sourceY, targetX, targetY)}ms`,
              } as CSSProperties
            }
          />
        </>
      )}
    </>
  );
}
