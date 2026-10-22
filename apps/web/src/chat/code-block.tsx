import { memo, useEffect, useMemo, useState } from "react";
import { cn } from "../lib/cn.ts";
import { retryImport } from "../lib/retry-import.ts";
import type { Line, Tokenize } from "./highlight.ts";

/** Linguagens com destaque e os nomes que o cercado do markdown pode trazer. Poucas de propósito:
 * cada gramática é um chunk próprio, baixado só quando a linguagem aparece num bloco. */
const LANGUAGES = {
  typescript: ["ts", "mts", "cts"],
  javascript: ["js", "mjs", "cjs", "jsx"], // a gramática JavaScript do VS Code já cobre JSX
  tsx: [],
  json: ["jsonc"],
  python: ["py"],
  shellscript: ["sh", "bash", "shell", "zsh"],
  go: ["golang"],
  rust: ["rs"],
  sql: [],
  yaml: ["yml"],
} satisfies Record<string, string[]>;
export type Grammar = keyof typeof LANGUAGES;

const BY_NAME = new Map(
  Object.entries(LANGUAGES).flatMap(([grammar, aliases]) =>
    [grammar, ...aliases].map((name) => [name, grammar as Grammar] as const),
  ),
);

/** A gramática pelo info string do cercado (```TS title="a.ts" → typescript); fora da lista, nada. */
export function grammarOf(info = ""): Grammar | undefined {
  return BY_NAME.get(info.trim().split(/\s/, 1)[0]?.toLowerCase() ?? "");
}

type Engine = { tokenizerFor: (lang: Grammar) => Promise<Tokenize> };

/** O Shiki vem sob demanda, no primeiro bloco com linguagem conhecida: fora do JS principal. */
export const loadHighlighter = retryImport((): Promise<Engine> => import("./highlight.ts"));

export type CodeBlockProps = {
  code: string;
  /** Info string do cercado (```ts) ou o nome da linguagem. */
  lang?: string;
  className?: string;
  load?: () => Promise<Engine>;
};

/** Bloco de código com destaque enquanto o texto chega: texto puro na hora (e de vez, se o destaque
 * falhar ou a linguagem não estiver na lista), cores quando o Shiki carrega. O texto do modelo nunca
 * vira HTML: cada token é um nó de texto do React. Linha completa não renderiza de novo. */
export function CodeBlock({ code, lang, className, load = loadHighlighter }: CodeBlockProps) {
  const grammar = grammarOf(lang);
  const [ready, setReady] = useState<{ grammar: Grammar; tokenize: Tokenize }>();
  useEffect(() => {
    if (!grammar) return;
    let live = true;
    load()
      .then((engine) => engine.tokenizerFor(grammar))
      .then((tokenize) => live && setReady({ grammar, tokenize }))
      .catch(() => undefined); // sem destaque: o texto puro já está na tela
    return () => {
      live = false;
    };
  }, [grammar, load]);
  const text = code.replaceAll("\r\n", "\n");
  const tokenize = ready && ready.grammar === grammar ? ready.tokenize : undefined;
  const highlighted = useMemo(() => tokenize?.(text), [tokenize, text]);
  return (
    <pre
      className={cn("syntax overflow-x-auto rounded-md bg-muted p-3 font-mono text-sm", className)}
      data-lang={grammar}
    >
      <code>
        {highlighted ? (
          <>
            <DoneLines lines={highlighted.lines} />
            <TokenLine line={highlighted.tail} />
          </>
        ) : (
          text
        )}
      </code>
    </pre>
  );
}

const DoneLines = memo(function DoneLines({ lines }: { lines: Line[] }) {
  // biome-ignore lint/suspicious/noArrayIndexKey: linha completa nunca muda de lugar nem de conteúdo
  return lines.map((line, index) => <TokenLine key={index} line={line} end={"\n"} />);
});

const TokenLine = memo(function TokenLine({ line, end }: { line: Line; end?: string }) {
  return (
    <>
      {line.map((token) => (
        <span
          key={token.offset}
          style={token.color === "inherit" ? undefined : { color: token.color }}
        >
          {token.content}
        </span>
      ))}
      {end}
    </>
  );
});
