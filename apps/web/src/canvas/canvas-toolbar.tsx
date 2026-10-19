import { Panel, useReactFlow } from "@xyflow/react";
import { Fragment, useId, useState } from "react";
import { Icon, type IconName } from "../components/icons.tsx";
import { Button } from "../components/ui/button.tsx";
import { popoverClass } from "../components/ui/overlay.ts";
import { cn } from "../lib/cn.ts";
import { layoutNodes, loadDagre } from "./auto-layout.ts";
import { FIT_VIEW, type StudioFlowEdge, type StudioFlowNode } from "./flow.ts";
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

export type CanvasToolbarProps = {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};

/** Ferramentas no canto do canvas: o que o teclado faz, também ao alcance do mouse e do toque. */
export function CanvasToolbar({ undo, redo, canUndo, canRedo }: CanvasToolbarProps) {
  return (
    <Panel position="top-left">
      {/* fieldset: o grupo nativo (papel "group"), com nome para o leitor de tela. */}
      <fieldset aria-label="Ferramentas do canvas" className="flex gap-1">
        <Tool id="undo" icon="undo" onClick={undo} disabled={!canUndo} />
        <Tool id="redo" icon="redo" onClick={redo} disabled={!canRedo} />
        <OrganizeButton />
        <ShortcutList />
      </fieldset>
    </Panel>
  );
}
