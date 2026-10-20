import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "../mocks/node.ts";
import * as rag from "./index-document.ts";

const URL = "http://rag.test/api/v1/index";
const sized = (name: string, size: number) =>
  Object.defineProperty(new File([], name), "size", { value: size });
const answer = (body: object, status = 201) => HttpResponse.json(body, { status });
const ok = { document_id: "d1", chunks_created: 3, success: true }; // IndexDocumentOutput
const send = (content = "x", signal?: AbortSignal) =>
  rag.indexDocument(URL, { name: "a.md", content }, signal);

it("precheck: .md/.txt/.json em qualquer caixa até o teto; PDF, outro tipo e acima, não", () => {
  expect(rag.precheck(new File(["# a"], "Guia.MD"))).toBeNull();
  expect(rag.precheck(new File(["a"], "notas.txt"))).toBeNull();
  expect(rag.precheck(sized("dados.json", rag.MAX_BODY_BYTES))).toBeNull();
  expect(rag.precheck(new File(["%PDF-1.7"], "manual.PDF"))).toMatch(/^PDF ainda não é aceito/);
  expect(rag.precheck(new File(["x"], "foto.png"))).toMatch(/^Tipo não aceito/);
  expect(rag.precheck(new File(["x"], "LEIAME"))).toMatch(/^Tipo não aceito/);
  const big = sized("grande.md", rag.MAX_BODY_BYTES + 1);
  const read = vi.spyOn(big, "arrayBuffer");
  expect(rag.precheck(big)).toBe("Arquivo acima de 2 MiB, o limite do serviço.");
  expect(read).not.toHaveBeenCalled(); // recusa sem ler
});

describe("readText", () => {
  it("devolve sem o BOM; recusa UTF-8 inválido, PDF renomeado, só espaço e o ilegível", async () => {
    expect(await rag.readText(new File(["\uFEFFolá"], "a.md"))).toBe("olá");
    const invalid = new File([new Uint8Array([0x6f, 0xff])], "a.txt");
    await expect(rag.readText(invalid)).rejects.toThrow("O arquivo não é texto UTF-8.");
    // Cabeçalho de PDF em ASCII decodifica sem erro: só os bytes mágicos o pegam.
    await expect(rag.readText(new File(["%PDF-1.4\n"], "a.txt"))).rejects.toThrow(/^PDF ainda/);
    await expect(rag.readText(new File([" \n\t"], "a.md"))).rejects.toThrow("Arquivo vazio.");
    const gone = new File(["x"], "a.md");
    vi.spyOn(gone, "arrayBuffer").mockRejectedValue(new DOMException("", "NotFoundError"));
    await expect(rag.readText(gone)).rejects.toThrow("Não foi possível ler o arquivo.");
  });
});

it("sourceUriOf: o mesmo nome em NFC ou NFD, e nada de controle ou invisível cru", () => {
  expect(rag.sourceUriOf("relatório final.md")).toBe("upload:relat%C3%B3rio%20final.md");
  expect(rag.sourceUriOf("relato\u0301rio final.md")).toBe(rag.sourceUriOf("relatório final.md"));
  expect(rag.sourceUriOf("fatura\u202Edm.txt")).toBe("upload:fatura%E2%80%AEdm.txt");
});

describe("indexDocument", () => {
  it("manda título, texto e source_uri em JSON e devolve o documento criado", async () => {
    let seen: unknown;
    server.use(
      http.post(URL, async ({ request }) => {
        seen = { type: request.headers.get("content-type"), body: await request.json() };
        return answer(ok);
      }),
    );
    const doc = await rag.indexDocument(URL, { name: "guia.md", content: "# Guia" });
    expect(doc).toEqual({ documentId: "d1", chunksCreated: 3 });
    const body = { title: "guia.md", content: "# Guia", source_uri: "upload:guia.md" };
    expect(seen).toEqual({ type: "application/json", body });
  });

  it("erro: o envelope, o status sem envelope; 2xx fora do schema não é indexado", async () => {
    const error = { code: "validation_error", message: "content vazio depois da limpeza" };
    server.use(
      http.post(URL, () => answer({ error }, 422), { once: true }),
      http.post(URL, () => new HttpResponse("bad gateway", { status: 502 }), { once: true }),
      http.post(URL, () => answer({ ...ok, success: false, message: "não indexou" }), {
        once: true,
      }),
      http.post(URL, () => answer({ ...ok, chunks_created: -1 })),
    );
    await expect(send()).rejects.toThrow(error.message);
    await expect(send()).rejects.toThrow("O serviço respondeu 502.");
    await expect(send()).rejects.toThrow("não indexou");
    await expect(send()).rejects.toThrow(/^Resposta inesperada/);
  });

  it("sem rede vira IndexError; abortado rejeita com o abort", async () => {
    server.use(http.post(URL, () => HttpResponse.error()));
    await expect(send()).rejects.toThrow(/^Sem conexão/);
    const error = await send("x", AbortSignal.abort()).catch((e) => e);
    expect(error).not.toBeInstanceOf(rag.IndexError);
    expect(error.name).toBe("AbortError");
    // Abort no meio do corpo (o MSW não erra o corpo abortado: Response falso).
    const stop = new AbortController();
    const json = () => Promise.reject(new DOMException("", "AbortError"));
    vi.stubGlobal("fetch", async () => {
      stop.abort(); // a conexão cai depois dos cabeçalhos
      return { ok: true, status: 201, json };
    });
    const late = await send("x", stop.signal).catch((e) => e);
    expect(late.name).toBe("AbortError");
  });

  it("corpo que passa do teto depois de codificado nem sai", async () => {
    // Aspas viram \" no JSON: 1,5 MiB de aspas são 3 MiB de corpo. Pedido que saísse acharia
    // a rede sem handler (onUnhandledRequest: "error") e a mensagem seria outra.
    await expect(send('"'.repeat(1.5 * 2 ** 20))).rejects.toThrow(/^Codificado para envio/);
  });
});
