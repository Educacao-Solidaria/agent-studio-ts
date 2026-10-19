import { Handle, type HandleType, type NodeProps, Position } from "@xyflow/react";
import { Badge, type BadgeProps } from "../components/ui/badge.tsx";
import { cn } from "../lib/cn.ts";
import { formatDuration } from "../lib/format.ts";
import type { NodeExecutionState } from "./domain.ts";
import { NODE_LABELS, type StudioFlowNode } from "./flow.ts";
import { NODE_PORTS, PORT_TYPE_LABELS, type Port } from "./ports.ts";

const STATES: Record<NodeExecutionState, { label: string; variant: BadgeProps["variant"] }> = {
  idle: { label: "Ocioso", variant: "neutral" },
  queued: { label: "Na fila", variant: "warning" },
  running: { label: "Executando", variant: "primary" },
  success: { label: "Concluído", variant: "success" },
  error: { label: "Erro", variant: "danger" },
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

/** Nó genérico: todo tipo sem componente próprio em `canvas/nodes/` é desenhado assim. */
export function DefaultNode({ type, data, selected }: NodeProps<StudioFlowNode>) {
  const state = STATES[data.state];
  const { inputs, outputs } = NODE_PORTS[type];
  return (
    <div
      className={cn(
        "min-w-44 rounded-md border bg-surface px-3 py-2 text-surface-foreground shadow-sm",
        selected && "border-primary ring-1 ring-primary",
        data.state === "error" && "border-danger",
      )}
    >
      {inputs.map((port, i) => (
        <PortHandle key={port.id} port={port} type="target" index={i} count={inputs.length} />
      ))}
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-sm">{NODE_LABELS[type]}</span>
        <Badge variant={state.variant}>{state.label}</Badge>
      </div>
      {data.error && <p className="mt-1 max-w-56 text-danger text-xs">{data.error}</p>}
      {data.lastExecutionDurationMs !== undefined && (
        <p className="mt-1 text-muted-foreground text-xs">
          {formatDuration(data.lastExecutionDurationMs)}
        </p>
      )}
      {outputs.map((port, i) => (
        <PortHandle key={port.id} port={port} type="source" index={i} count={outputs.length} />
      ))}
    </div>
  );
}
