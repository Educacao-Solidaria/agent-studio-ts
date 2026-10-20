import { describe, expect, it } from "vitest";
import { splitFences } from "./fences.ts";

const code = (lang: string, text: string) => ({ kind: "code", lang, code: text });
const text = (value: string) => ({ kind: "text", text: value });

describe("splitFences", () => {
  it("separa texto e blocos fechados, com a linguagem do info string", () => {
    expect(splitFences("Veja:\n```ts title=a.ts\nconst a = 1;\n```\nPronto.")).toEqual([
      text("Veja:"),
      code("ts", "const a = 1;"),
      text("Pronto."),
    ]);
    expect(splitFences("a\r\n~~~py\r\nx\r\n~~~\r\n")).toEqual([text("a"), code("py", "x")]);
  });

  it("bloco ainda chegando vai até o fim, sem mostrar a cerca de fechamento pela metade", () => {
    const answer = "Oi\n```py\nx = 1\n```\nfim";
    for (let i = 0; i <= answer.length; i++) {
      for (const segment of splitFences(answer.slice(0, i))) {
        if (segment.kind === "code") expect(segment.code).not.toContain("`");
      }
    }
    expect(splitFences("Oi\n```py\nx = 1\n``")).toEqual([text("Oi"), code("py", "x = 1")]);
    expect(splitFences("```py\nx = 1\n")).toEqual([code("py", "x = 1\n")]);
    expect(splitFences("```py\nx = 1\n```")).toEqual([code("py", "x = 1")]);
  });

  it("fecha só com o mesmo caractere e pelo menos o tamanho da abertura", () => {
    expect(splitFences("````md\n```\nainda\n````")).toEqual([code("md", "```\nainda")]);
    expect(splitFences("~~~\na\n```\n~~~~ \nb")).toEqual([code("", "a\n```"), text("b")]);
    // No fim, linha de outro caractere é conteúdo, não cerca em curso.
    expect(splitFences("```\na\n~~")).toEqual([code("", "a\n~~")]);
  });

  it("tira o recuo da abertura; 4 espaços ou crase no info string não abrem bloco", () => {
    expect(splitFences("  ```\n    a\n b\n  ```")).toEqual([code("", "  a\nb")]);
    expect(splitFences("    ```\nx")).toEqual([text("    ```\nx")]);
    expect(splitFences("```a``` b")).toEqual([text("```a``` b")]);
  });

  it("vazio, só a abertura e cerca seguida de cerca", () => {
    expect(splitFences("")).toEqual([]);
    expect(splitFences("```")).toEqual([code("", "")]);
    expect(splitFences("```\n```\n```js")).toEqual([code("", ""), code("js", "")]);
  });
});
