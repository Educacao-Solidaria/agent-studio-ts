// Formatos de chave conhecidos (OpenRouter `sk-or-v1-…`, OpenAI `sk-…`, Anthropic `sk-ant-…`) e o
// valor de um `Authorization: Bearer …` colado de um curl.
const SECRET = /\bsk-[\w-]{20,}|\bBearer\s+[\w.~+/-]{16,}=*/g;
export const REDACTED = "[chave removida]";

/** Troca o que tem forma de chave de API e conta as trocas: o arquivo diz quantas foram. */
export function redactor() {
  let count = 0;
  const redact = (text: string) =>
    text.replace(SECRET, () => {
      count++;
      return REDACTED;
    });
  return { redact, count: () => count };
}
