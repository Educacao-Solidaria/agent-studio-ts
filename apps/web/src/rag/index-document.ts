/** Rota de indexação da API HTTP v1 do brain-router-py (contrato §2). */
export const INDEX_PATH = "/api/v1/index";
/** Teto do corpo no servidor (`DEFAULT_MAX_BODY_BYTES`): acima dele a resposta é 413. */
export const MAX_BODY_BYTES = 2 * 1024 * 1024;
/** Só texto no v1: o serviço não extrai texto de PDF (os parsers cobrem Markdown, texto e JSON). */
export const ACCEPTED = [".md", ".txt", ".json"];

const PDF = "PDF ainda não é aceito: o serviço não extrai texto de PDF. Envie .md, .txt ou .json.";
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

/** Motivo pronto para a tela: o arquivo não foi (ou não vai) para o RAG. */
export class IndexError extends Error {}

export type Doc = { name: string; content: string };
export type Indexed = { documentId: string; chunksCreated: number };

const LIMIT = `${MAX_BODY_BYTES / 2 ** 20} MiB`;
const text = (value: unknown) => (typeof value === "string" && value ? value : undefined);
const fail = (message: string): never => {
  throw new IndexError(message);
};

function extension(name: string) {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot).toLowerCase();
}

/**
 * Identidade do arquivo no RAG: o servidor troca a versão anterior do mesmo `source_uri`.
 * NFC para o nome vindo do macOS (NFD) ser o mesmo; codificado porque o servidor recusa
 * caractere de controle e invisível no `source_uri` (e o nome do arquivo pode ter).
 */
export const sourceUriOf = (name: string) => `upload:${encodeURIComponent(name.normalize("NFC"))}`;

/** Recusa que dispensa ler o arquivo (tipo e tamanho); `null` = segue para a leitura. */
export function precheck(file: File): string | null {
  const ext = extension(file.name);
  if (ext === ".pdf") return PDF;
  if (!ACCEPTED.includes(ext)) return "Tipo não aceito: envie .md, .txt ou .json.";
  if (file.size > MAX_BODY_BYTES) return `Arquivo acima de ${LIMIT}, o limite do serviço.`;
  return null;
}

/** UTF-8 estrito: binário (ou um PDF renomeado) não entra no RAG como texto cheio de "�". */
export async function readText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer().catch(() => fail("Não foi possível ler o arquivo."));
  const bytes = new Uint8Array(buffer);
  if (PDF_MAGIC.every((byte, i) => bytes[i] === byte)) fail(PDF);
  let content = "";
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(bytes); // tira o BOM
  } catch {
    fail("O arquivo não é texto UTF-8.");
  }
  if (!content.trim()) fail("Arquivo vazio.");
  return content;
}

/**
 * `POST /api/v1/index` com o texto do arquivo (tenant e chunking ficam no padrão do servidor).
 * Sem retry: quem decide reenviar é a pessoa. Abortado, rejeita com o motivo do abort.
 */
export async function indexDocument(url: string, doc: Doc, signal?: AbortSignal): Promise<Indexed> {
  const payload = { title: doc.name, content: doc.content, source_uri: sourceUriOf(doc.name) };
  const body = new TextEncoder().encode(JSON.stringify(payload));
  if (body.byteLength > MAX_BODY_BYTES) fail(`Codificado para envio, passa de ${LIMIT}.`);
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  const response = await fetch(url, { method: "POST", headers, body, signal }).catch((error) =>
    signal?.aborted ? Promise.reject(error) : fail("Sem conexão com o serviço de indexação."),
  );
  const json = await response.json().catch(() => null);
  signal?.throwIfAborted();
  if (!response.ok) fail(text(json?.error?.message) ?? `O serviço respondeu ${response.status}.`);
  const { document_id: id, chunks_created: chunks, success, message } = json ?? {};
  if (success !== true || !text(id) || !(Number.isSafeInteger(chunks) && chunks >= 0)) {
    fail(text(message) ?? "Resposta inesperada do serviço de indexação.");
  }
  return { documentId: id, chunksCreated: chunks };
}
