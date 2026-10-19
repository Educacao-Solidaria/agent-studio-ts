import { Handle, type HandleType, type NodeProps, Position } from "@xyflow/react";
import { Icon, type IconName } from "../components/icons.tsx";
import { Badge, type BadgeProps } from "../components/ui/badge.tsx";
import { cn } from "../lib/cn.ts";
import { formatDuration } from "../lib/format.ts";
import type { NodeExecutionState } from "./domain.ts";
import { NODE_LABELS, type StudioFlowNode } from "./flow.ts";
import { useLiveStatus } from "./node-status.ts";
import { NODE_PORTS, PORT_TYPE_LABELS, type Port } from "./ports.ts";

type StateBadge = { label: string; variant: BadgeProps["variant"]; icon: IconName };

/** Estado não é só cor: cada um tem ícone e texto (o ícone é decorativo; o texto é lido). */
const STATES: Record<NodeExecutionState, StateBadge> = {
  idle: { label: "Ocioso", variant: "neutral", icon: "idle" },
  queued: { label: "Na fila", variant: "warning", icon: "queued" },
  running: { label: "Executando", variant: "primary", icon: "loading" },
  success: { label: "Concluído", variant: "success", icon: "success" },
  error: { label: "Erro", variant: "danger", icon: "error" },
};

type PortHandleProps = { port: Port; type: HandleType; index: number; count: number };

/** Uma porta do nó: entradas à esquerda e saídas à direita, distribuídas na altura. */
function PortHandle({ port, type, index, count }: PortHandleProps) {
  return (
    <Handle
      id={port.id}
      type={type}
      position={type === "target" ? Position.Left : Position.Right}
      style={{ top: `${((index + 1) / (count + 1)) * 100}%` }}
      title={`${port.label} (${PORT_TYPE_LABELS[port.type]})`}
    />
  );
}

/**
 * Nó genérico: todo tipo sem componente próprio em `canvas/nodes/` é desenhado assim. O estado
 * vem da execução ao vivo (assinada só para este nó) e, antes dela, do contrato (`data`). Em
 * execução o ícone gira, menos para quem pediu menos movimento (`motion-safe`).
 */
export function DefaultNode({ id, type, data, selected }: NodeProps<StudioFlowNode>) {
  const { state: contract, error, lastExecutionDurationMs: durationMs } = data;
  const status = useLiveStatus(id) ?? { state: contract, error, durationMs };
  const state = STATES[status.state];
  const { inputs, outputs } = NODE_PORTS[type];
  return (
    <div
      className={cn(
        "min-w-44 rounded-md border bg-surface px-3 py-2 text-surface-foreground shadow-sm",
        selected && "border-primary ring-1 ring-primary",
        status.state === "error" && "border-danger",
      )}
    >
      {inputs.map((port, i) => (
        <PortHandle key={port.id} port={port} type="target" index={i} count={inputs.length} />
      ))}
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-sm">{NODE_LABELS[type]}</span>
        <Badge variant={state.variant} className="gap-1">
          <Icon
            name={state.icon}
            size={12}
            className={cn(status.state === "running" && "motion-safe:animate-spin")}
          />
          {state.label}
        </Badge>
      </div>
      {status.error && <p className="mt-1 max-w-56 text-danger text-xs">{status.error}</p>}
      {status.durationMs !== undefined && (
        <p className="mt-1 text-muted-foreground text-xs">{formatDuration(status.durationMs)}</p>
      )}
      {outputs.map((port, i) => (
        <PortHandle key={port.id} port={port} type="source" index={i} count={outputs.length} />
      ))}
    </div>
  );
}
