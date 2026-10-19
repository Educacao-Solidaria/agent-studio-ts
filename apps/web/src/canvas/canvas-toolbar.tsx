import { Panel } from "@xyflow/react";
import { Icon, type IconName } from "../components/icons.tsx";
import { Button } from "../components/ui/button.tsx";
import { ariaKeys, keyHint, SHORTCUTS, type ShortcutId } from "./shortcuts.ts";

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
      <fieldset aria-label="Edição" className="flex gap-1">
        <Tool id="undo" icon="undo" onClick={undo} disabled={!canUndo} />
        <Tool id="redo" icon="redo" onClick={redo} disabled={!canRedo} />
      </fieldset>
    </Panel>
  );
}
