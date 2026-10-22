import type { ChartConfiguration } from "chart.js";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { retryImport } from "../lib/retry-import.ts";
import type { ChartHandle, ChartLook } from "./chart-kit.ts";

export type ChartKit = typeof import("./chart-kit.ts");
const importChartKit = retryImport((): Promise<ChartKit> => import("./chart-kit.ts"));

/** O Chart.js vem sob demanda, quando um gráfico monta: fora do bundle principal. */
export async function loadChartKit(): Promise<ChartKit> {
  // Sem canvas 2D o Chart.js só escreveria um erro no console e não desenharia: falha como a rede.
  const context = document.createElement("canvas").getContext("2d");
  if (!context) throw new Error("canvas 2D indisponível");
  return importChartKit();
}

/** O pedaço do Chart.js para os gráficos de um painel, baixado só quando há o que desenhar
 * (`wanted`); `failed` se não carregar. */
export function useChartKit(load: () => Promise<ChartKit> = loadChartKit, wanted = true) {
  const [state, setState] = useState<{ kit?: ChartKit; failed?: boolean }>({});
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    load().then(
      (kit) => live && setState({ kit }),
      () => live && setState({ failed: true }),
    );
    return () => {
      live = false;
    };
  }, [load, wanted]);
  return state;
}

const MOTION = "(prefers-reduced-motion: reduce)";
function subscribeLook(onChange: () => void) {
  const lists = ["(prefers-color-scheme: dark)", MOTION].map((query) => matchMedia(query));
  for (const list of lists) list.addEventListener("change", onChange);
  const theme = new MutationObserver(onChange); // o tema do app é o data-theme do <html>
  theme.observe(document.documentElement, { attributeFilter: ["data-theme"] });
  return () => {
    theme.disconnect();
    for (const list of lists) list.removeEventListener("change", onChange);
  };
}
// Em texto: o mesmo visual dá o mesmo snapshot (sem render à toa).
function readLook() {
  const style = getComputedStyle(document.documentElement);
  const tokens = ["--primary", "--muted-foreground", "--border", "--success", "--background"];
  const [line, text, grid, success, background] = tokens.map((name) =>
    style.getPropertyValue(name).trim(),
  );
  const reducedMotion = matchMedia(MOTION).matches;
  return JSON.stringify({ reducedMotion, line, text, grid, success, background });
}

/** Cores do tema e `prefers-reduced-motion`, relidos quando qualquer um deles muda. */
export function useChartLook(): ChartLook {
  const look = useSyncExternalStore(subscribeLook, readLook, readLook);
  return useMemo(() => JSON.parse(look) as ChartLook, [look]);
}

/** Um gráfico: monta quando o pedaço chega, atualiza a cada `config` nova, destrói ao sair. */
export function ChartCanvas(props: { kit?: ChartKit; config: ChartConfiguration; label: string }) {
  const { kit, config, label } = props;
  const canvas = useRef<HTMLCanvasElement>(null);
  const chart = useRef<ChartHandle>(undefined);
  const latest = useRef(config);
  useLayoutEffect(() => {
    latest.current = config;
  });
  useEffect(() => {
    if (!kit || !canvas.current) return;
    chart.current = kit.mountChart(canvas.current, latest.current);
    return () => {
      chart.current?.destroy();
      chart.current = undefined;
    };
  }, [kit]);
  useEffect(() => {
    chart.current?.update(config); // em bloco: o que o efeito devolve é a limpeza dele
  }, [config]);
  return (
    <div className="relative h-40">
      <canvas ref={canvas} role="img" aria-label={label} />
    </div>
  );
}
