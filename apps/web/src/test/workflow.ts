import { expect } from "vitest";

// Workflow do GitHub Actions conferido no texto, sem dependência de YAML (deploy.test, visual.test).

export type Line = { text: string; kids: Line[] };

/** O YAML como árvore de indentação: cada linha é filha da última linha menos indentada acima
 * dela, sem comentários. Basta para o subconjunto do workflow: mapas em bloco, listas com `- ` e
 * escalar numa linha (sem ` #` dentro de aspas). */
export function outline(yaml: string) {
  const root: Line = { text: "", kids: [] };
  const open = [{ indent: -1, line: root }];
  for (const raw of yaml.split("\n")) {
    const text = raw.replace(/\s+#.*$/, "").trim();
    if (text === "" || text.startsWith("#")) continue;
    const indent = raw.length - raw.trimStart().length;
    while ((open.at(-1)?.indent ?? -1) >= indent) open.pop();
    const line: Line = { text, kids: [] };
    open.at(-1)?.line.kids.push(line);
    open.push({ indent, line });
  }
  return root;
}

export const keyOf = (text: string) => /^(?:- )?([\w-]+):(?: |$)/.exec(text)?.[1];
const scalarOf = (text: string) => text.replace(/^(?:- )?[\w-]+:\s*/, "");
export const texts = (line?: Line) => line?.kids.map(({ text }) => text);

/** O filho `chave:`. Chave repetida o GitHub recusa, e este teste também. */
export function get(line: Line | undefined, key: string) {
  const found = line?.kids.filter(({ text }) => keyOf(text) === key) ?? [];
  expect(found.length, `chave repetida: ${key}`).toBeLessThan(2);
  return found[0];
}
export const value = (line: Line | undefined, key: string) => {
  const found = get(line, key);
  return found && scalarOf(found.text);
};

export const steps = (job?: Line) => get(job, "steps")?.kids ?? [];
/** Campo de um passo: a 1ª chave está na própria linha do `- `, as outras são filhas dela. */
export const field = (step: Line, key: string) =>
  keyOf(step.text) === key ? scalarOf(step.text) : value(step, key);
/** Cada passo pelo que faz: a action sem a versão, ou o comando. */
export const pipeline = (job?: Line) =>
  steps(job).map((step) => field(step, "uses")?.replace(/@.*/, "") ?? field(step, "run"));
