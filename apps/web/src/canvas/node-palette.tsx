import { useReactFlow, type XYPosition } from "@xyflow/react";
import { type KeyboardEvent, useId, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../components/ui/dialog.tsx";
import { Input } from "../components/ui/input.tsx";
import { cn } from "../lib/cn.ts";
import { FALLBACK_SIZE } from "./auto-layout.ts";
import type { NodeType } from "./domain.ts";
import { NODE_LABELS, NODE_TYPES, nextNodeId, type StudioFlowNode, toFlowNode } from "./flow.ts";

/** O que cada tipo faz, numa linha: aparece na paleta e entra na busca. */
const HINTS: Record<NodeType, string> = {
  prompt: "Texto que abre o fluxo, com variáveis",
  cache: "Reaproveita a resposta de uma pergunta parecida",
  rag: "Busca trechos de documentos para dar contexto",
  gateway: "Chama o modelo de linguagem",
  eval: "Mede a qualidade da resposta",
  custom: "Nó livre, com entrada e saída de qualquer dado",
};

const STEPS: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };

/** Sem acento e sem caixa: "avaliacao" acha "Avaliação" (NFD separa a letra do acento). */
const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Tipos cujo nome ou descrição tem todas as palavras da busca, na ordem do contrato. */
export function matchNodeTypes(query: string): NodeType[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return NODE_TYPES.filter((type) => {
    const text = fold(`${NODE_LABELS[type]} ${HINTS[type]}`);
    return words.every((word) => text.includes(word));
  });
}

export type NodePaletteProps = {
  /** Ponto da tela onde o nó entra (o duplo clique ou o centro do canvas); null = fechada. */
  at: XYPosition | null;
  onClose: () => void;
};

/**
 * Paleta de inserção no padrão combobox + listbox: o foco fica na busca, as setas mudam a
 * opção ativa (`aria-activedescendant`), Enter insere e Esc fecha; o diálogo do Radix prende
 * o foco e, ao fechar, ele volta para onde estava. O nó entra centrado no ponto, ocioso e
 * selecionado (o painel abre nele), e é uma entrada do desfazer.
 */
export function NodePalette({ at, onClose }: NodePaletteProps) {
  const flow = useReactFlow<StudioFlowNode>();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const opener = useRef<Element | null>(null);
  const listId = useId();
  const types = matchNodeTypes(query);
  const chosen = types[active];

  const close = () => {
    setQuery("");
    setActive(0);
    onClose();
  };
  const insert = (type: NodeType) => {
    if (!at) return;
    const { x, y } = flow.screenToFlowPosition(at);
    const position = { x: x - FALLBACK_SIZE.width / 2, y: y - FALLBACK_SIZE.height / 2 };
    flow.setNodes((nodes) => {
      const id = nextNodeId(type, new Set(nodes.map((node) => node.id)));
      const node = toFlowNode({ id, type, position, state: "idle", data: {} });
      return [
        ...nodes.map((n) => (n.selected ? { ...n, selected: false } : n)),
        { ...node, selected: true },
      ];
    });
    close();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    const step = STEPS[event.key] ?? 0;
    // A lista dá a volta: seta para cima na primeira vai para a última.
    if (step && types.length > 0) setActive((active + step + types.length) % types.length);
    else if (event.key === "Enter" && chosen) insert(chosen);
    else return;
    event.preventDefault();
  };

  return (
    <Dialog open={at !== null} onOpenChange={(open) => !open && close()}>
      {/* nokey: com o canvas atrás do diálogo, Delete ou Ctrl+A no botão Fechar não agem nele. */}
      <DialogContent
        className="nokey max-w-md"
        onOpenAutoFocus={() => {
          opener.current = document.activeElement;
        }}
        onCloseAutoFocus={(event) => {
          // Sem gatilho do Radix (abre pelo duplo clique ou pela barra): volta a quem abriu.
          event.preventDefault();
          if (opener.current instanceof HTMLElement) opener.current.focus();
        }}
      >
        <DialogTitle>Adicionar nó</DialogTitle>
        <DialogDescription>Busque pelo nome ou pelo que o nó faz. Enter insere.</DialogDescription>
        <Input
          role="combobox"
          aria-label="Buscar tipo de nó"
          aria-expanded
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={chosen && `${listId}-${chosen}`}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
        <div id={listId} role="listbox" aria-label="Tipos de nó" className="grid gap-1">
          {types.map((type, index) => (
            // tabIndex -1: focável só por script (o lint pede); o foco fica na busca.
            // biome-ignore lint/a11y/useKeyWithClickEvents: o teclado é o da busca (combobox).
            <div
              key={type}
              id={`${listId}-${type}`}
              role="option"
              tabIndex={-1}
              aria-selected={type === chosen}
              onPointerMove={() => setActive(index)}
              onClick={() => insert(type)}
              className={cn("cursor-pointer rounded-md px-3 py-2", type === chosen && "bg-muted")}
            >
              <span className="block font-medium text-sm">{NODE_LABELS[type]}</span>
              <span className="block text-muted-foreground text-xs">{HINTS[type]}</span>
            </div>
          ))}
        </div>
        {/* Sempre montado: região que aparece já com o texto muitos leitores não anunciam. */}
        <p role="status" className="text-muted-foreground text-sm">
          {types.length === 0 ? "Nenhum tipo de nó encontrado." : ""}
        </p>
      </DialogContent>
    </Dialog>
  );
}
