import { Panel, type XYPosition } from "@xyflow/react";
import { useEffect, useState } from "react";
import { retryImport } from "../lib/retry-import.ts";

export type CanvasDialogs = typeof import("./canvas-dialogs.ts");

/** Paleta e modelos, sob demanda e num pedaço só; depois de uma falha, o pedido seguinte baixa de
 * novo de verdade. */
export const loadCanvasDialogs = retryImport(
  (): Promise<CanvasDialogs> => import("./canvas-dialogs.ts"),
);

export type LazyNodePaletteProps = {
  /** Ponto da tela onde o nó entra; null = fechada. O pedaço só baixa no primeiro pedido. */
  at: XYPosition | null;
  onClose: () => void;
  load?: () => Promise<Pick<CanvasDialogs, "NodePalette">>;
};

/**
 * A paleta de nós chega no primeiro pedido de abrir (duplo clique ou barra) e abre assim que o
 * pedaço chega. Falha vira aviso e desfaz o pedido; o próximo pedido tenta de novo. A falha fica
 * aqui: não sobe ao ErrorBoundary, que remontaria o canvas e perderia o fluxo (por isso nada de
 * `React.lazy`, que guarda a promessa rejeitada e lança no render).
 */
export function LazyNodePalette({ at, onClose, load = loadCanvasDialogs }: LazyNodePaletteProps) {
  const [dialogs, setDialogs] = useState<Pick<CanvasDialogs, "NodePalette">>();
  const [failed, setFailed] = useState(false);
  const wanted = at !== null && !dialogs;
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    load().then(
      (chunk) => {
        if (!live) return;
        setDialogs(chunk);
        setFailed(false);
      },
      () => {
        if (!live) return;
        setFailed(true);
        onClose();
      },
    );
    return () => {
      live = false;
    };
  }, [wanted, load, onClose]);
  return (
    <>
      {dialogs && <dialogs.NodePalette at={at} onClose={onClose} />}
      {failed && (
        <Panel position="bottom-center">
          <p
            role="alert"
            className="rounded-md border border-danger bg-surface px-3 py-1.5 text-danger text-sm"
          >
            Não foi possível abrir a paleta de nós. Tente de novo; se o erro persistir, recarregue a
            página.
          </p>
        </Panel>
      )}
    </>
  );
}
