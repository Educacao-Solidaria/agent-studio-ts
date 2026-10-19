import type {
  EvalNodeConfig,
  GatewayNodeConfig,
  NodeType,
  PromptNodeConfig,
  RagNodeConfig,
  StudioEdge,
  StudioNode,
} from "./domain.ts";

/** Um fluxo pronto: nós e arestas do contrato do Luan, com as portas de `ports.ts`. */
export type FlowTemplate = {
  id: string;
  name: string;
  description: string;
  nodes: StudioNode[];
  edges: StudioEdge[];
};

/** Nó ocioso na posição [x, y]; a config sai dos auxiliares abaixo (literais com `satisfies`). */
const node = (
  id: string,
  type: NodeType,
  [x, y]: [number, number],
  data: Record<string, unknown> = {},
): StudioNode => ({ id, type, position: { x, y }, state: "idle", data });

/** Aresta da saída `sourceHandle` para a entrada `targetHandle` (ids de NODE_PORTS). */
const link = (source: string, sourceHandle: string, target: string, targetHandle: string) => ({
  id: `${source}-${target}`,
  source,
  sourceHandle,
  target,
  targetHandle,
});

// Configs com os padrões dos schemas do Luan; cada modelo muda só o que importa nele.
const prompt = (template: string, ...variables: string[]) =>
  ({ template, variables }) satisfies PromptNodeConfig;
const rag = (collectionName: string, extra: Partial<RagNodeConfig> = {}) =>
  ({
    collectionName,
    ...{ topK: 5, minScore: 0.7, searchMode: "hybrid", rerank: true },
    ...extra,
  }) satisfies RagNodeConfig;
const evaluate = (metrics: EvalNodeConfig["metrics"], minPassScore: number) =>
  ({ metrics, minPassScore, alertOnFailure: true }) satisfies EvalNodeConfig;
const gateway = (model: string, extra: Partial<GatewayNodeConfig> = {}) =>
  ({
    model,
    ...{ temperature: 0.3, fallbackModels: [], stream: true, timeoutMs: 30_000 },
    ...extra,
  }) satisfies GatewayNodeConfig;

const ragSimples: FlowTemplate = {
  id: "rag-simples",
  name: "RAG simples",
  description:
    "A pergunta busca trechos na coleção de documentos, e o modelo responde com esse contexto.",
  nodes: [
    node(
      "prompt",
      "prompt",
      [0, 80],
      prompt("Responda usando só o contexto: {{pergunta}}", "pergunta"),
    ),
    node("rag", "rag", [280, 0], rag("documentos")),
    node("gateway", "gateway", [560, 80], gateway("openai/gpt-4o-mini", { temperature: 0.2 })),
  ],
  edges: [
    link("prompt", "prompt", "rag", "query"),
    link("prompt", "prompt", "gateway", "prompt"),
    link("rag", "context", "gateway", "context"),
  ],
};

const fast = gateway("openai/gpt-4o-mini", { timeoutMs: 15_000 });
const strong = gateway("anthropic/claude-3.5-sonnet", {
  fallbackModels: ["openai/gpt-4o"],
  timeoutMs: 60_000,
});

const roteador: FlowTemplate = {
  id: "roteador-de-modelos",
  name: "Roteador de modelos",
  description:
    "Um nó Personalizado escolhe o modelo: o rápido e barato para o simples, o robusto para o difícil. A avaliação compara latência, custo e relevância.",
  nodes: [
    node("prompt", "prompt", [0, 110], prompt("{{pergunta}}", "pergunta")),
    node("roteador", "custom", [280, 110]),
    node("gateway-rapido", "gateway", [560, 40], fast),
    node("gateway-robusto", "gateway", [560, 180], strong),
    node("eval", "eval", [840, 110], evaluate(["latency", "cost", "relevance"], 0.75)),
  ],
  edges: [
    link("prompt", "prompt", "roteador", "in"),
    link("roteador", "out", "gateway-rapido", "prompt"),
    link("roteador", "out", "gateway-robusto", "prompt"),
    link("gateway-rapido", "completion", "eval", "response"),
    link("gateway-robusto", "completion", "eval", "response"),
  ],
};

const planner = gateway("openai/gpt-4o", {
  systemPrompt: "Planeje os passos e diga quais ferramentas usar, com os argumentos.",
  ...{ temperature: 0.2, stream: false, timeoutMs: 60_000 },
});
const synthesizer = gateway("openai/gpt-4o", {
  systemPrompt: "Responda ao objetivo usando o resultado das ferramentas.",
  ...{ fallbackModels: ["anthropic/claude-3.5-sonnet"], timeoutMs: 60_000 },
});

/**
 * O laço do agente (o modelo chama uma ferramenta, lê o resultado e decide de novo) é um ciclo, e
 * o grafo de execução é um DAG: o validador do canvas e o `ExecutionGraph.validate` do Luan
 * recusam ciclo. Por isso o modelo desenrola uma volta do laço — planejar, usar as ferramentas,
 * responder. Mais voltas são mais um trecho igual; o laço de chamadas de ferramenta dentro de um
 * só passo (os `ToolCall` do contrato) é do executor do gateway, não da topologia.
 */
const agente: FlowTemplate = {
  id: "agente-com-tools",
  name: "Agente autônomo com tools",
  description:
    "O planejador escolhe as ferramentas (busca na base e uma Personalizada) e o sintetizador responde com o plano e o resultado delas: uma volta do laço do agente, desenrolada.",
  nodes: [
    node("objetivo", "prompt", [0, 120], prompt("Objetivo: {{objetivo}}", "objetivo")),
    node("planejador", "gateway", [280, 120], planner),
    node("busca", "rag", [560, 40], rag("base-de-conhecimento", { topK: 8, rerankTopN: 4 })),
    node("ferramenta", "custom", [560, 200]),
    node("sintetizador", "gateway", [840, 120], synthesizer),
    node("eval", "eval", [1120, 120], evaluate(["accuracy", "relevance"], 0.8)),
  ],
  edges: [
    link("objetivo", "prompt", "planejador", "prompt"),
    link("planejador", "completion", "busca", "query"),
    link("planejador", "completion", "ferramenta", "in"),
    link("planejador", "completion", "sintetizador", "prompt"),
    link("busca", "context", "sintetizador", "context"),
    link("ferramenta", "out", "sintetizador", "context"),
    link("sintetizador", "completion", "eval", "response"),
  ],
};

/** O catálogo, na ordem em que aparece. Carregado sob demanda (fora do bundle principal). */
export const FLOW_TEMPLATES: FlowTemplate[] = [ragSimples, roteador, agente];
