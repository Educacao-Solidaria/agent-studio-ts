import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NodeStateMachine } from "../../../../src/state/stateMachine.ts";
import { renderFlowInstance } from "../test/flow.tsx";
import type { StudioEdge, StudioNode } from "./domain.ts";
import { renderSvg, type Scene } from "./export-svg.ts";
import { StudioCanvas } from "./studio-canvas.tsx";

// O download do módulo falha só quando o teste derruba a "rede"; fora isso, o módulo de verdade.
const network = vi.hoisted(() => ({ down: false }));
vi.mock("./export-svg.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("./export-svg.ts")>();
  return {
    ...real,
    exportFlowSvg: (...args: Parameters<typeof real.exportFlowSvg>) => {
      if (network.down) throw new TypeError("Failed to fetch dynamically imported module");
      return real.exportFlowSvg(...args);
    },
  };
});

/** Tema de mentira: cada token vira um valor distinto, para saber de onde veio cada cor. */
const resolve = (value: string) => value.replace(/var\(--([\w-]+)\)/g, "[$1]");
const parse = (svg: string) => new DOMParser().parseFromString(svg, "image/svg+xml");
const texts = (doc: Document) => [...doc.querySelectorAll("text")].map((text) => text.textContent);

const prompt: Scene["nodes"][number] = {
  box: { x: 0, y: 0, width: 160, height: 40 },
  label: "Prompt",
  state: "success",
  ports: [{ x: 157, y: 17, width: 6, height: 6 }],
};
const scene: Scene = {
  nodes: [
    prompt,
    {
      box: { x: 300, y: 100, width: 180, height: 40 },
      label: "Gateway",
      state: "error",
      ports: [],
    },
  ],
  edges: [
    {
      path: "M163,20 C230,20 230,120 297,120",
      start: { x: 163, y: 20 },
      end: { x: 297, y: 120 },
      states: ["success", "error"],
      active: false,
    },
  ],
};

describe("renderSvg", () => {
  it("desenha só nós e arestas, nas cores do tema, com margem em volta", () => {
    const doc = parse(renderSvg(scene, resolve));
    const svg = doc.documentElement;
    expect(doc.querySelector("parsererror")).toBeNull();
    // Caixa de (0,0) a (480,140) mais 24 px de cada lado.
    expect(svg.getAttribute("viewBox")).toBe("-24 -24 528 188");
    expect([svg.getAttribute("width"), svg.getAttribute("height")]).toEqual(["528", "188"]);
    expect(svg.querySelector("rect")?.getAttribute("fill")).toBe("[color-background]");
    expect(texts(doc)).toEqual(["Prompt", "Concluído", "Gateway", "Erro"]);
    const path = svg.querySelector("path");
    expect(path?.getAttribute("d")).toBe(scene.edges[0]?.path);
    expect(path?.getAttribute("stroke")).toBe("url(#edge-0)");
    expect(path?.getAttribute("stroke-width")).toBe("1.5"); // sem dado em trânsito
    const stops = [...svg.querySelectorAll("#edge-0 stop")].map((s) =>
      s.getAttribute("stop-color"),
    );
    expect(stops).toEqual(["[color-success]", "[color-danger]"]);
    // Retângulos: fundo, nó 1, selo 1, nó 2, selo 2. O nó em erro ganha a borda de perigo.
    const rects = [...svg.querySelectorAll("rect")];
    expect([rects[1], rects[3]].map((r) => r?.getAttribute("stroke"))).toEqual([
      "[color-border]",
      "[color-danger]",
    ]);
    expect(rects[4]?.getAttribute("fill")).toBe("[color-danger]"); // selo "Erro" do Badge
    const port = svg.querySelector("circle");
    expect(["cx", "cy", "r"].map((name) => port?.getAttribute(name))).toEqual(["160", "20", "3"]);
  });

  it("o texto do usuário entra só como texto: nada executável na imagem", () => {
    const evil = '<script>alert(1)</script><foreignObject onload="x()"/>';
    const svg = renderSvg({ nodes: [{ ...prompt, label: evil }], edges: [] }, resolve);
    const doc = parse(svg);
    expect(doc.querySelectorAll("script, foreignObject, a, style, image, use")).toHaveLength(0);
    const attributes = [...doc.querySelectorAll("*")].flatMap((el) => el.getAttributeNames());
    expect(attributes.filter((name) => /^on|href$/i.test(name))).toEqual([]);
    expect(texts(doc)[0]).toBe(evil);
    expect(svg).toContain("&lt;script&gt;");
  });

  it("fluxo vazio: imagem válida, só a margem, sem NaN", () => {
    const svg = renderSvg({ nodes: [], edges: [] }, resolve);
    expect(parse(svg).documentElement.getAttribute("viewBox")).toBe("-24 -24 48 48");
    expect(svg).not.toContain("NaN");
  });
});

const nodes: StudioNode[] = [
  { id: "a", type: "prompt", position: { x: 0, y: 0 }, state: "success", data: {} },
  { id: "b", type: "gateway", position: { x: 300, y: 0 }, state: "idle", data: {} },
];
const edges: StudioEdge[] = [
  { id: "a-b", source: "a", sourceHandle: "prompt", target: "b", targetHandle: "prompt" },
];

describe("Exportar SVG no canvas", () => {
  const blobs: Blob[] = [];
  const downloads: Array<{ href: string; name: string; attached: boolean }> = [];
  beforeEach(() => {
    blobs.length = downloads.length = 0;
    const createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return "blob:fluxo";
    });
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloads.push({ href: this.href, name: this.download, attached: this.isConnected });
    });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 19, 15, 30));
    // Só os tokens crus, como o globals.css: o Tailwind não emite todo `--color-*`.
    document.documentElement.style.setProperty("--background", "rgb(1, 2, 3)");
    document.documentElement.style.setProperty("--success-foreground", "rgb(4, 5, 6)");
  });
  afterEach(() => {
    vi.useRealTimers();
    document.documentElement.removeAttribute("style");
    network.down = false;
  });
  const exportButton = () => screen.getByRole("button", { name: "Exportar SVG" });

  it("baixa o fluxo como fluxo-AAAA-MM-DD.svg, com o estado ao vivo e o tema de agora", async () => {
    const timers = vi.spyOn(globalThis, "setTimeout");
    const machine = new NodeStateMachine();
    renderFlowInstance(
      <StudioCanvas initialNodes={nodes} initialEdges={edges} execution={machine} />,
    );
    act(() => void machine.transition("b", "running"));
    fireEvent.click(exportButton());
    await waitFor(() => expect(downloads).toHaveLength(1));

    expect(downloads[0]).toEqual({
      href: "blob:fluxo",
      name: "fluxo-2026-10-19.svg",
      attached: true,
    });
    expect(blobs[0]?.type).toBe("image/svg+xml");
    const doc = parse((await blobs[0]?.text()) ?? "");
    expect(texts(doc)).toEqual(["Prompt", "Concluído", "Gateway", "Executando"]);
    expect(doc.querySelectorAll("path")).toHaveLength(1); // a aresta a → b
    expect(doc.querySelector("path")?.getAttribute("stroke-width")).toBe("2.5"); // dado em trânsito
    expect(doc.querySelector("rect")?.getAttribute("fill")).toBe("rgb(1, 2, 3)");
    const done = [...doc.querySelectorAll("text")].find((text) => text.textContent === "Concluído");
    expect(done?.getAttribute("fill")).toBe("rgb(4, 5, 6)"); // texto do selo, como o Badge
    // Nada dos painéis do canvas (mini-mapa, controles, barra) entra na imagem.
    expect(doc.documentElement.textContent).not.toMatch(/Mini-mapa|zoom|Organizar|Atalhos/);
    // A URL do arquivo é liberada depois, não no clique (que cancelaria o download).
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    const later = timers.mock.calls.find(([, delay]) => delay === 40_000)?.[0] as () => void;
    later();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fluxo");
  });

  it("falha no download do módulo vira aviso, e tentar de novo funciona", async () => {
    network.down = true;
    renderFlowInstance(<StudioCanvas initialNodes={nodes} />);
    fireEvent.click(exportButton());
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Não foi possível exportar. Tente de novo.",
    );
    expect(downloads).toHaveLength(0);

    network.down = false;
    fireEvent.click(exportButton());
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
