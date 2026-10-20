export type Segment = { kind: "text"; text: string } | { kind: "code"; lang: string; code: string };

const OPEN = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const CLOSE = /^ {0,3}(`+|~+)[ \t]*$/;

/**
 * Separa o markdown em texto e blocos cercados (``` ou ~~~, até 3 espaços de recuo, como no
 * CommonMark), para cada bloco ir ao CodeBlock enquanto a resposta chega: bloco sem a cerca de
 * fechamento vai até o fim, e a última linha que ainda pode virar essa cerca fica de fora.
 * ponytail: só o nível de cima; cercado dentro de lista ou citação fica no texto (o renderizador
 * de markdown do painel, PR 52/54, assume se precisar).
 */
export function splitFences(markdown: string): Segment[] {
  const segments: Segment[] = [];
  const lines = markdown.split(/\r?\n/);
  let text: string[] = [];
  let block: { fence: string; indent: number; lang: string; code: string[] } | undefined;
  const flush = () => {
    if (block) segments.push({ kind: "code", lang: block.lang, code: block.code.join("\n") });
    else if (text.join("\n")) segments.push({ kind: "text", text: text.join("\n") });
    [block, text] = [undefined, []];
  };
  for (const [index, line] of lines.entries()) {
    if (!block) {
      const [open, indent = "", fence = "", info = ""] = OPEN.exec(line) ?? [];
      // Crase no info string de um cercado de crases é código inline (```a``` b), não bloco.
      if (!open || (fence[0] === "`" && info.includes("`"))) text.push(line);
      else {
        flush();
        block = {
          fence,
          indent: indent.length,
          lang: info.trim().split(/\s/, 1)[0] ?? "",
          code: [],
        };
      }
      continue;
    }
    const mark = CLOSE.exec(line)?.[1] ?? "";
    if (mark[0] === block.fence[0]) {
      const closes = mark.length >= block.fence.length;
      if (closes) flush();
      if (closes || index === lines.length - 1) continue;
    }
    // Conteúdo perde o recuo da abertura (até ele), como no CommonMark.
    block.code.push(line.slice(Math.min(block.indent, line.search(/[^ ]|$/))));
  }
  flush();
  return segments;
}
