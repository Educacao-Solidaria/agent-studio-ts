import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { NodeStateMachine } from "../../../../src/state/stateMachine.ts";
import type { NodeExecutionState } from "./domain.ts";
import { sampleEdges, sampleNodes } from "./sample-flow.ts";
import { StudioCanvas, type StudioCanvasProps } from "./studio-canvas.tsx";

const meta = {
  title: "canvas/StudioCanvas",
  component: StudioCanvas,
  parameters: { layout: "fullscreen" },
  args: { className: "h-dvh", initialNodes: sampleNodes, initialEdges: sampleEdges },
} satisfies Meta<typeof StudioCanvas>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SampleFlow: Story = {};
export const Empty: Story = { args: { initialNodes: [], initialEdges: [] } };

/** Roteiro de uma volta do fluxo de exemplo: [ms desde o início da volta, nó, estado]. */
const SCRIPT: Array<[number, string, NodeExecutionState]> = [
  [0, "prompt", "running"],
  [700, "prompt", "success"],
  [700, "cache", "running"],
  [700, "rag", "running"],
  [1600, "cache", "success"],
  [2000, "rag", "success"],
  [2000, "gateway", "running"],
  [3200, "gateway", "success"],
  [3200, "eval", "running"],
  [3800, "eval", "success"],
];
const LAP_MS = 5000;

/**
 * O fluxo de exemplo executando em laço pela `NodeStateMachine` do Luan: o status muda em cada nó
 * e o pulso aparece nas arestas por onde o dado está passando (destino executando, origem com
 * saída). Para ver o indicador parado, ligue "reduzir movimento" no sistema.
 */
function LiveRun(props: StudioCanvasProps) {
  const [machine] = useState(() => new NodeStateMachine());
  useEffect(() => {
    let timers: number[] = [];
    const lap = () => {
      // Concluído → ocioso é transição válida da máquina; a volta anterior acabou toda em sucesso.
      for (const { id } of sampleNodes) {
        if (machine.getState(id) !== "idle") machine.transition(id, "idle");
      }
      timers = SCRIPT.map(([at, id, to]) =>
        window.setTimeout(() => machine.transition(id, to), at),
      );
      timers.push(window.setTimeout(lap, LAP_MS));
    };
    lap();
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [machine]);
  return <StudioCanvas {...props} execution={machine} />;
}

export const LiveExecution: Story = {
  args: { initialNodes: sampleNodes.map((node) => ({ ...node, state: "idle" })) },
  render: (args) => <LiveRun {...args} />,
};
