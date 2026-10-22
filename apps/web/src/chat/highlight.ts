import { createJavaScriptRegexEngine } from "@shikijs/engine-javascript";
import {
  type CodeToTokensBaseOptions,
  codeToTokensBase,
  createShikiPrimitiveAsync,
  getLastGrammarState,
  type LanguageRegistration,
  type ShikiPrimitive,
  type ThemedToken,
  type ThemeRegistration,
} from "@shikijs/primitive";
import { retryImport } from "../lib/retry-import.ts";
import type { Grammar } from "./code-block.tsx";

/** Este módulo inteiro vem sob demanda (import() no CodeBlock), e cada gramática TextMate é um
 * chunk próprio: só baixa a de uma linguagem que aparecer num bloco (e, se falhar, o próximo bloco
 * dela baixa de novo). */
const GRAMMARS: Record<Grammar, () => Promise<{ default: LanguageRegistration[] }>> = {
  typescript: retryImport(() => import("@shikijs/langs/typescript")),
  javascript: retryImport(() => import("@shikijs/langs/javascript")),
  tsx: retryImport(() => import("@shikijs/langs/tsx")),
  json: retryImport(() => import("@shikijs/langs/json")),
  python: retryImport(() => import("@shikijs/langs/python")),
  shellscript: retryImport(() => import("@shikijs/langs/shellscript")),
  go: retryImport(() => import("@shikijs/langs/go")),
  rust: retryImport(() => import("@shikijs/langs/rust")),
  sql: retryImport(() => import("@shikijs/langs/sql")),
  yaml: retryImport(() => import("@shikijs/langs/yaml")),
};

/** Cor → escopos TextMate. A cor é uma variável CSS (`.syntax` no globals.css): claro e escuro
 * seguem o tema do app sem baixar tema do Shiki. Vence o seletor mais específico. */
const SCOPES = {
  comment: ["comment", "punctuation.definition.comment"],
  keyword: ["keyword", "storage", "variable.language"],
  string: ["string"],
  constant: ["constant", "support.constant"],
  function: ["entity.name.function", "support.function"],
  type: ["entity.name.type", "entity.name.tag", "support.type", "support.class"],
};
const PLAIN = "inherit";
const THEME: ThemeRegistration = {
  name: "studio",
  fg: PLAIN,
  bg: "transparent",
  settings: [
    ...Object.entries(SCOPES).map(([color, scope]) => ({
      scope,
      settings: { foreground: `var(--syntax-${color})` },
    })),
    // Operador, chave de JSON e o miolo de `${}` ficam na cor do texto.
    {
      scope: ["keyword.operator", "support.type.property-name", "meta.template.expression"],
      settings: { foreground: PLAIN },
    },
  ],
};

export type Line = ThemedToken[];
/** Linhas completas (só crescem no fim; cada uma mantém a referência) e a última, em curso. */
export type Highlighted = { lines: Line[]; tail: Line };
export type Tokenize = (code: string) => Highlighted | undefined;

// Linha acima do teto sai sem cor: a última é refeita a cada token (custo quadrático nela).
const OPTIONS = { theme: THEME.name, tokenizeMaxLineLength: 2000 };

/** Destaque incremental: a gramática TextMate tokeniza linha a linha levando um estado (comentário
 * ou string aberta), então cada linha completa é tokenizada uma vez, a partir do estado da anterior,
 * e a cada token só a última, incompleta, é refeita. Texto que não estende o anterior recomeça. */
function incremental(shiki: ShikiPrimitive, lang: Grammar): Tokenize {
  let done = "";
  let lines: Line[] = [];
  let state: CodeToTokensBaseOptions["grammarState"];
  const tokenize = (code: string, tokenizeTimeLimit: number) =>
    codeToTokensBase(shiki, code, { ...OPTIONS, lang, grammarState: state, tokenizeTimeLimit });
  return (code) => {
    try {
      if (!code.startsWith(done)) [done, lines, state] = ["", [], undefined];
      const end = code.lastIndexOf("\n") + 1;
      if (end > done.length) {
        // Sem limite de tempo (0): o estado da linha completa vale para o resto do bloco, e um corte
        // no meio dela (o motor compila as regex no primeiro uso) deixaria tudo depois errado.
        const fresh = tokenize(code.slice(done.length, end - 1), 0);
        state = getLastGrammarState(shiki, fresh);
        lines = lines.concat(fresh);
        done = code.slice(0, end);
      }
      // A última é refeita a cada token: o limite padrão do Shiki segura uma linha patológica, e
      // um corte nela não passa adiante (o estado que segue é o da linha completa).
      return { lines, tail: tokenize(code.slice(end), 500)[0] ?? [] };
    } catch {
      return undefined; // gramática que falha nesta entrada: o bloco fica em texto puro
    }
  };
}

let shiki: Promise<ShikiPrimitive> | undefined;
const loaded = new Map<Grammar, Promise<void>>();

/** Motor de regex em JS (sem WASM) e tema na primeira chamada; cada gramática na primeira vez
 * que a linguagem aparece. Falha ao baixar não fica guardada: o próximo bloco tenta de novo. */
export async function tokenizerFor(lang: Grammar): Promise<Tokenize> {
  shiki ??= createShikiPrimitiveAsync({
    themes: [THEME],
    langs: [],
    engine: createJavaScriptRegexEngine(),
  });
  const instance = await shiki;
  let grammar = loaded.get(lang);
  if (!grammar) {
    grammar = instance.loadLanguage(GRAMMARS[lang]());
    loaded.set(lang, grammar);
    grammar.catch(() => loaded.delete(lang));
  }
  await grammar;
  return incremental(instance, lang);
}
