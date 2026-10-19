import { Panel, useReactFlow, useStoreApi } from "@xyflow/react";
import { Fragment, useId, useState } from "react";
import { Icon, type IconName } from "../components/icons.tsx";
import { Button } from "../components/ui/button.tsx";
import { popoverClass } from "../components/ui/overlay.ts";
import { cn } from "../lib/cn.ts";
import { layoutNodes, loadDagre } from "./auto-layout.ts";
import { FIT_VIEW, type StudioFlowEdge, type StudioFlowNode } from "./flow.ts";
import { useStatusStore } from "./node-status.ts";
import {
  ariaKeys,
  keyHint,
  keyLabel,
  SHORTCUT_IDS,
  SHORTCUTS,
  type ShortcutId,
} from "./shortcuts.ts";

type ToolProps = { id: ShortcutId; icon: IconName; onClick: () => void; disabled: boolean };

/** Botão com o atalho no nome acessível (`aria-keyshortcuts`) e na dica visível (`title`). */
function Tool({ id, icon, onClick, disabled }: ToolProps) {
  const { label } = SHORTCUTS[id];
  return (
    <Button
      variant="secondary"
      size="icon"
      className="size-8"
      aria-label={label}
      aria-keyshortcuts={ariaKeys(id)}
      title={`${label} (${keyHint(id)})`}
      {...{ onClick, disabled }}
    >
      <Icon name={icon} />
    </Button>
  );
}

/**
 * A lista de atalhos, gerada do mapa, aberta e fechada pelo botão (Esc nele também fecha). Botão
 * com `aria-expanded` em vez de `<details>`: o React Flow toma o Espaço (mover a vista) de todo
 * elemento que não seja botão ou link, e o `<summary>` não abriria pelo teclado.
 */
function ShortcutList() {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="relative">
      <Button
        variant="secondary"
        size="icon"
        className="size-8"
        aria-label="Atalhos do teclado"
        title="Atalhos do teclado"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => event.key === "Escape" && setOpen(false)}
      >
        <Icon name="keyboard" />
      </Button>
      {/* Fechada, o `hidden` vence o `grid`: o preflight do Tailwind usa !important. */}
      <dl
        id={id}
        hidden={!open}
        className={cn(
          popoverClass,
          "absolute top-10 left-0 grid w-80 grid-cols-[1fr_auto] gap-2 p-3 text-sm",
        )}
      >
        {SHORTCUT_IDS.map((key) => (
          <Fragment key={key}>
            <dt>{SHORTCUTS[key].label}</dt>
            <dd className="flex items-start justify-end gap-1">
              {SHORTCUTS[key].keys.map((combo) => (
                <kbd key={combo} className="rounded border bg-muted px-1.5 font-mono text-xs">
                  {keyLabel(combo)}
                </kbd>
              ))}
            </dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
}

/**
 * Organizar: o dagre (sob demanda) arruma o fluxo e a vista reenquadra. Nós e arestas são lidos
 * depois do download, então o que mudou enquanto ele chegava entra no layout. É uma mudança de
 * posição como outra qualquer: uma entrada do desfazer. Falha (rede caiu no meio do download)
 * vira aviso, e o fluxo fica como estava.
 */
function OrganizeButton() {
  const flow = useReactFlow<StudioFlowNode, StudioFlowEdge>();
  const [status, setStatus] = useState<"idle" | "busy" | "failed">("idle");
  const organize = async () => {
    setStatus("busy");
    try {
      const dagre = await loadDagre();
      flow.setNodes(layoutNodes(dagre, flow.getNodes(), flow.getEdges()));
      await flow.fitView(FIT_VIEW);
      setStatus("idle");
    } catch {
      setStatus("failed");
    }
  };
  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        className="h-8 px-2.5"
        disabled={status === "busy"}
        onClick={organize}
      >
        <Icon name="layout" />
        Organizar
      </Button>
      {status === "failed" && (
        <p role="alert" className="self-center text-danger text-sm">
          Não foi possível organizar. Tente de novo.
        </p>
      )}
    </>
  );
}

/**
 * Exportar: baixa o desenho do fluxo como SVG vetorial (nítido em qualquer tamanho), sem os
 * painéis, o mini-mapa e os controles do canvas, nas cores do tema de agora. O código vem sob
 * demanda; falha no download dele vira aviso.
 */
function ExportButton() {
  const flow = useReactFlow<StudioFlowNode, StudioFlowEdge>();
  const store = useStoreApi();
  const statuses = useStatusStore();
  const [failed, setFailed] = useState(false);
  const exportSvg = async () => {
    try {
      const { exportFlowSvg } = await import("./export-svg.ts");
      exportFlowSvg(flow, statuses, store.getState().domNode ?? document.documentElement);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  };
  return (
    <>
      <Button
        variant="secondary"
        size="icon"
        className="size-8"
        aria-label="Exportar SVG"
        title="Exportar o fluxo como imagem SVG"
        onClick={exportSvg}
      >
        <Icon name="download" />
      </Button>
      {failed && (
        <p role="alert" className="self-center text-danger text-sm">
          Não foi possível exportar. Tente de novo.
        </p>
      )}
    </>
  );
}

export type CanvasToolbarProps = {
  /** Abre a paleta de nós (o nó entra no centro da vista). */
  onAddNode: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};

/** Ferramentas no canto do canvas: o que o teclado faz, também ao alcance do mouse e do toque. */
export function CanvasToolbar({ onAddNode, undo, redo, canUndo, canRedo }: CanvasToolbarProps) {
  return (
    <Panel position="top-left">
      {/* fieldset: o grupo nativo (papel "group"), com nome para o leitor de tela. */}
      <fieldset aria-label="Ferramentas do canvas" className="flex gap-1">
        <Button
          variant="secondary"
          size="icon"
          className="size-8"
          aria-label="Adicionar nó"
          aria-haspopup="dialog"
          title="Adicionar nó (ou duplo clique no fundo do canvas)"
          onClick={onAddNode}
        >
          <Icon name="add" />
        </Button>
        <Tool id="undo" icon="undo" onClick={undo} disabled={!canUndo} />
        <Tool id="redo" icon="redo" onClick={redo} disabled={!canRedo} />
        <OrganizeButton />
        <ExportButton />
        <ShortcutList />
      </fieldset>
    </Panel>
  );
}
