import { useReactFlow } from "@xyflow/react";
import { type RefObject, useRef, useState } from "react";
import { Button } from "../components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../components/ui/dialog.tsx";
import {
  FIT_VIEW,
  type StudioFlowEdge,
  type StudioFlowNode,
  toFlowEdge,
  toFlowNode,
} from "./flow.ts";
import { keyHint } from "./shortcuts.ts";
import type { Graph } from "./template-picker.tsx";
import { FLOW_TEMPLATES, type FlowTemplate } from "./templates.ts";
import { sameGraph } from "./use-flow-history.ts";

export type TemplateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** O último fluxo carregado: o canvas "tem alterações" quando difere dele. */
  loaded: RefObject<Graph>;
};

/**
 * O catálogo de modelos (este módulo e os dados vêm sob demanda). Escolher um modelo com o canvas
 * alterado pede confirmação; a troca é uma entrada só do desfazer — Ctrl+Z volta o fluxo de antes.
 */
export function TemplateDialog({ open, onOpenChange, loaded }: TemplateDialogProps) {
  const flow = useReactFlow<StudioFlowNode, StudioFlowEdge>();
  const [pending, setPending] = useState<FlowTemplate | null>(null);
  const opener = useRef<Element | null>(null);
  const toggle = (next: boolean) => {
    setPending(null);
    onOpenChange(next);
  };
  const replace = (template: FlowTemplate) => {
    // Cópia nova a cada carga: editar o fluxo nunca mexe no catálogo.
    const { nodes, edges } = structuredClone(template);
    const graph = { nodes: nodes.map(toFlowNode), edges: edges.map(toFlowEdge) };
    // Nós e arestas no mesmo evento: um render, uma entrada do desfazer.
    flow.setNodes(graph.nodes);
    flow.setEdges(graph.edges);
    loaded.current = graph;
    toggle(false);
    void flow.fitView(FIT_VIEW);
  };
  const choose = (template: FlowTemplate) => {
    const now = { nodes: flow.getNodes(), edges: flow.getEdges() };
    // Canvas vazio não tem o que perder; seleção e medida não contam como alteração.
    if (now.nodes.length > 0 && !sameGraph(loaded.current, now)) setPending(template);
    else replace(template);
  };

  return (
    <Dialog open={open} onOpenChange={toggle}>
      {/* nokey: com o canvas atrás do diálogo, Delete ou Ctrl+A aqui não agem nele. */}
      <DialogContent
        className="nokey max-w-md"
        onOpenAutoFocus={() => {
          opener.current = document.activeElement;
        }}
        onCloseAutoFocus={(event) => {
          // Aberto pelo botão da barra, sem gatilho do Radix: o foco volta para ele.
          event.preventDefault();
          if (opener.current instanceof HTMLElement) opener.current.focus();
        }}
      >
        <DialogTitle>Modelos de fluxo</DialogTitle>
        {pending ? (
          <>
            <DialogDescription>
              O canvas tem alterações. Carregar "{pending.name}" troca o fluxo inteiro; dá para
              voltar com Desfazer ({keyHint("undo")}).
            </DialogDescription>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPending(null)}>
                Cancelar
              </Button>
              <Button onClick={() => replace(pending)}>Substituir</Button>
            </div>
          </>
        ) : (
          <>
            <DialogDescription>
              Um fluxo pronto no lugar do atual, para começar rápido.
            </DialogDescription>
            <div className="grid gap-2">
              {FLOW_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => choose(template)}
                  className="rounded-md border px-3 py-2 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <span className="block font-medium text-sm">{template.name}</span>
                  <span className="block text-muted-foreground text-xs">
                    {template.nodes.length} nós · {template.description}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
