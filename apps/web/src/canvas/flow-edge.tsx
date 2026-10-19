import { BaseEdge, type EdgeProps, getBezierPath, useNodesData } from "@xyflow/react";
import { type CSSProperties, useId } from "react";
import type { NodeExecutionState } from "./domain.ts";
import { STATE_COLORS, type StudioFlowEdge, type StudioFlowNode } from "./flow.ts";
import { useLiveStatus } from "./node-status.ts";

/**
 * Há dado em trânsito quando o destino está executando e a origem já entregou a saída
 * (concluída) ou ainda a produz (executando, em streaming).
 */
export function isTransmitting(source?: NodeExecutionState, target?: NodeExecutionState) {
  return target === "running" && (source === "success" || source === "running");
}

/**
 * Aresta do estúdio: gradiente da cor do estado da origem para a do destino, atualizado ao
 * vivo, e, com fluxo ativo, linha mais grossa com traços correndo no sentido do dado. Com
 * prefers-reduced-motion os traços ficam parados: o "ativo" continua visível, sem movimento.
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
        <path
          d={path}
          data-flow="active"
          className="pointer-events-none animate-flow-dash fill-none stroke-2 stroke-surface [stroke-dasharray:4_12]"
        />
      )}
    </>
  );
}
