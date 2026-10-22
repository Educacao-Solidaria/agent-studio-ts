import { screen } from "@testing-library/react";
import { ReactFlow, type XYPosition } from "@xyflow/react";
import { useCallback, useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { renderFlowInstance } from "../test/flow.tsx";
import { LazyNodePalette, type LazyNodePaletteProps, loadCanvasDialogs } from "./lazy-dialogs.tsx";

/** Canvas mínimo: o botão pede a paleta, como o da barra; fechar desfaz o pedido. */
function Host({ load }: Pick<LazyNodePaletteProps, "load">) {
  const [at, setAt] = useState<XYPosition | null>(null);
  const close = useCallback(() => setAt(null), []);
  return (
    <>
      <button type="button" onClick={() => setAt({ x: 100, y: 100 })}>
        Pedir paleta
      </button>
      <ReactFlow nodes={[]}>
        <LazyNodePalette at={at} onClose={close} load={load} />
      </ReactFlow>
    </>
  );
}

const ask = () => screen.getByRole("button", { name: "Pedir paleta" });
const opened = () => screen.findByRole("dialog", { name: "Adicionar nó" });

describe("LazyNodePalette", () => {
  // O primeiro import() do arquivo transforma os módulos do pedaço; fora do prazo dos findBy.
  beforeAll(() => loadCanvasDialogs());

  it("só baixa no primeiro pedido; depois de fechar, reabre sem baixar de novo", async () => {
    const load = vi.fn(loadCanvasDialogs);
    const { user } = renderFlowInstance(<Host load={load} />);
    expect(load).not.toHaveBeenCalled();

    await user.click(ask());
    await opened();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(ask());
    await opened();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("falha vira aviso e desfaz o pedido; o pedido seguinte baixa de novo e abre", async () => {
    const load = vi
      .fn<typeof loadCanvasDialogs>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch dynamically imported module: x"))
      .mockImplementation(loadCanvasDialogs);
    const { user } = renderFlowInstance(<Host load={load} />);
    await user.click(ask());
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Não foi possível abrir a paleta de nós. Tente de novo; se o erro persistir, recarregue a página.",
    );
    expect(screen.queryByRole("dialog")).toBeNull();

    // Sem desfazer o pedido, o clique seguinte não mudaria nada e não haveria nova tentativa.
    await user.click(ask());
    await opened();
    // hidden: com o Dialog aberto o resto da página fica aria-hidden, e a busca comum nunca
    // acharia o aviso (passaria mesmo com ele na tela).
    expect(screen.queryByRole("alert", { hidden: true })).toBeNull();
    expect(load).toHaveBeenCalledTimes(2);
  });
});
