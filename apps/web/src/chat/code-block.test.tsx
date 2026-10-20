import { render, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import css from "../styles/globals.css?raw";
import { CodeBlock, type Grammar, grammarOf } from "./code-block.tsx";
import { type Highlighted, tokenizerFor } from "./highlight.ts";

/** Cada linha como texto: token colorido vira {texto:cor}, sem cor fica cru. */
const paint = (out: Highlighted | undefined) =>
  [...(out?.lines ?? []), out?.tail ?? []].map((line) =>
    line
      .map(({ content, color = "" }) =>
        /^var/.test(color) ? `{${content}:${color.slice(13, -1)}}` : content,
      )
      .join(""),
  );

const spans = (element: Element) => [...element.querySelectorAll("span")];

describe("grammarOf", () => {
  it("lê a linguagem do info string do cercado, sem diferenciar maiúsculas", () => {
    expect(grammarOf("ts")).toBe("typescript");
    expect(grammarOf('  TSX title="a.tsx"')).toBe("tsx");
    expect(grammarOf("jsx")).toBe("javascript");
    expect(grammarOf("bash")).toBe("shellscript");
    for (const name of [undefined, "", "  ", "brainfuck", "constructor", "__proto__"]) {
      expect(grammarOf(name)).toBeUndefined();
    }
  });
});

describe("tokenizerFor", () => {
  it("dá a cada categoria uma cor do tema, operador na cor do texto; o CSS define todas", async () => {
    const tokenize = await tokenizerFor("typescript");
    expect(paint(tokenize('// c\nconst n: Foo = f(1, "s");'))).toEqual([
      "{// c:comment}",
      '{const:keyword} n: {Foo:type} = {f:function}({1:constant}, {"s":string});',
    ]);
    for (const name of ["comment", "constant", "function", "keyword", "string", "type"]) {
      expect(css).toMatch(new RegExp(`\\.syntax \\{[^}]*--syntax-${name}:`));
    }
  });

  it("cada linguagem da lista carrega e colore no motor de regex em JS", async () => {
    const samples = {
      typescript: "let a",
      javascript: "let a",
      tsx: "let a",
      json: '"a"',
      python: "def f(): 1",
      shellscript: "if true; then :; fi",
      go: "func f() {}",
      rust: "fn f() {}",
      sql: "SELECT 1",
      yaml: "a: 1",
    } satisfies Record<Grammar, string>;
    for (const [lang, code] of Object.entries(samples)) {
      const [line] = paint((await tokenizerFor(lang as Grammar))(code));
      expect(line, lang).toMatch(/\{[^}]+:(keyword|string|type)\}/);
    }
  });

  it("tokeniza cada linha completa uma vez só e chega ao mesmo resultado de uma vez", async () => {
    const code = `/* a\n b */ const x = \`t\n\${y}\`;\n\nlet s = 'q';\n`;
    const tokenize = await tokenizerFor("typescript");
    const steps = Array.from({ length: code.length + 1 }, (_, i) => tokenize(code.slice(0, i)));
    // O estado atravessa as linhas: o comentário e a template string continuam na seguinte.
    const once = ["{/* a:comment}", "{ b */:comment} {const:keyword} x = {`t:string}"];
    once.push(`\${y}{\`:string};`, "", "{let:keyword} s = {'q':string};", "");
    expect(paint((await tokenizerFor("typescript"))(code))).toEqual(once);
    expect(paint(steps.at(-1))).toEqual(once);
    // Linha completa é a mesma referência dali em diante: não foi refeita nem recolorida.
    for (const step of steps) {
      for (const [n, line] of step?.lines.entries() ?? [])
        expect(line).toBe(steps.at(-1)?.lines[n]);
    }
  });

  it("linha completa vai até o fim mesmo devagar; só a última tem limite de tempo", async () => {
    const tokenize = await tokenizerFor("typescript");
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => (now += 1000)); // cada passo "leva" 1 s
    const lines = paint(tokenize("/* a */ x\nlet b\nlet c"));
    expect(lines).toEqual(["{/* a */:comment} x", "{let:keyword} b", "let c"]);
  });

  it("recomeça quando o texto não estende o anterior; teto de linha; vazio", async () => {
    const tokenize = await tokenizerFor("typescript");
    tokenize("/* aberto\n");
    expect(paint(tokenize("let b = 2;"))).toEqual(["{let:keyword} b = {2:constant};"]);
    const long = `const s = "${"x".repeat(2000)}";`;
    expect(paint(tokenize(long))).toEqual([long]); // acima do teto: sem cor
    expect(tokenize("")).toEqual({ lines: [], tail: [] });
    expect(tokenize("\n\n")).toEqual({ lines: [[], []], tail: [] });
  });
});

describe("CodeBlock", () => {
  beforeAll(() => tokenizerFor("typescript")); // gramática já compilada: o teste não espera por ela

  it("mostra o texto na hora e o destaque quando o Shiki carrega", async () => {
    const { container } = render(<CodeBlock code={"const a = 1;\r\nlet b;"} lang="ts" />);
    const pre = container.querySelector("pre") as HTMLElement;
    expect(pre.textContent).toBe("const a = 1;\nlet b;");
    expect(spans(pre)).toEqual([]);
    await waitFor(() => expect(spans(pre).length).toBeGreaterThan(0));
    const keyword = spans(pre).find((span) => span.textContent === "const");
    expect(keyword?.style.color).toBe("var(--syntax-keyword)");
    expect(pre.textContent).toBe("const a = 1;\nlet b;");
  });

  it("nunca interpreta o texto do modelo como HTML, com ou sem destaque", async () => {
    const code =
      'const h = "<img src=x onerror=alert(1)>";\n</code></pre><script>alert(2)</script>';
    for (const lang of ["ts", "html"]) {
      const { container, unmount } = render(<CodeBlock code={code} lang={lang} />);
      if (lang === "ts") await waitFor(() => expect(spans(container).length).toBeGreaterThan(0));
      expect(container.querySelector("img, script")).toBeNull();
      expect(container.textContent).toBe(code);
      unmount();
    }
  });

  it("texto chegando aos pedaços termina igual ao bloco renderizado de uma vez", async () => {
    const code = `function f(a: number) {\n  return \`\${a}\`; // ok\n}\n`;
    const whole = render(<CodeBlock code={code} lang="typescript" />).container;
    const stream = render(<CodeBlock code="" lang="typescript" />);
    await waitFor(() => expect(spans(whole).length).toBeGreaterThan(0));
    for (let i = 1; i <= code.length; i += 3) {
      stream.rerender(<CodeBlock code={code.slice(0, i)} lang="typescript" />);
    }
    stream.rerender(<CodeBlock code={code} lang="typescript" />);
    expect(stream.container.innerHTML).toBe(whole.innerHTML);
  });

  it("trocar a linguagem não reaproveita o destaque da anterior", async () => {
    const { container, rerender } = render(<CodeBlock code="let a" lang="ts" />);
    await waitFor(() => expect(spans(container).length).toBeGreaterThan(0));
    rerender(<CodeBlock code="let a" lang="text" />);
    expect(spans(container)).toEqual([]);
  });

  it("fica em texto puro sem linguagem conhecida, e sem baixar o Shiki para ela", async () => {
    const failing = vi.fn(() => Promise.reject(new Error("sem rede")));
    const unused = vi.fn(() => Promise.reject(new Error("não devia baixar")));
    const { container } = render(
      <>
        <CodeBlock code="x = 1" lang="python" load={failing} />
        <CodeBlock code="++[>+<-]" lang="brainfuck" load={unused} />
      </>,
    );
    await waitFor(() => expect(failing).toHaveBeenCalledOnce());
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(unused).not.toHaveBeenCalled();
    expect(spans(container)).toEqual([]);
    expect(container.textContent).toBe("x = 1++[>+<-]");
  });
});
