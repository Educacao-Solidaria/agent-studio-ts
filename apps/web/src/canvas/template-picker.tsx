import { useRef, useState } from "react";
import { Icon } from "../components/icons.tsx";
import { Button } from "../components/ui/button.tsx";
import type { StudioFlowEdge, StudioFlowNode } from "./flow.ts";
import { type CanvasDialogs, loadCanvasDialogs } from "./lazy-dialogs.tsx";

/** O fluxo como o canvas o guarda: os nós e as arestas do React Flow. */
export type Graph = { nodes: StudioFlowNode[]; edges: StudioFlowEdge[] };
type DialogModule = Pick<CanvasDialogs, "TemplateDialog">;

const EMPTY: Graph = { nodes: [], edges: [] };

export type TemplatePickerProps = {
  /** O fluxo com que o canvas abriu: até um modelo ser carregado, é a base das "alterações". */
  opening?: Graph;
  load?: () => Promise<DialogModule>;
};

/**
 * Modelos: troca o fluxo do canvas por um pronto. A base vem do canvas, não do store do React
 * Flow (com um provider por fora ele nasce vazio). O diálogo e o catálogo vêm sob demanda, no
 * primeiro clique, no pedaço da paleta; falha ao baixá-los vira aviso.
 */
export function TemplatePicker({ opening = EMPTY, load = loadCanvasDialogs }: TemplatePickerProps) {
  const loaded = useRef(opening);
  const opener = useRef<HTMLButtonElement>(null);
  const [dialog, setDialog] = useState<DialogModule | null>(null);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const show = async () => {
    try {
      setDialog(dialog ?? (await load()));
      setFailed(false);
      setOpen(true);
    } catch {
      setFailed(true);
    }
  };
  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        className="h-8 px-2.5"
        aria-haspopup="dialog"
        ref={opener}
        onClick={show}
      >
        <Icon name="flow" />
        Modelos
      </Button>
      {failed && (
        <p role="alert" className="self-center text-danger text-sm">
          Não foi possível abrir os modelos. Tente de novo; se o erro persistir, recarregue a
          página.
        </p>
      )}
      {dialog && <dialog.TemplateDialog {...{ open, loaded, opener }} onOpenChange={setOpen} />}
    </>
  );
}
