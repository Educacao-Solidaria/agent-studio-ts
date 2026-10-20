import { type ChangeEvent, type DragEvent, useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "../components/icons.tsx";
import { Button } from "../components/ui/button.tsx";
import { cn } from "../lib/cn.ts";
import * as rag from "./index-document.ts";

type Status = "queued" | "sending" | "done" | "error" | "cancelled";
type Entry = { id: number; name: string; status: Status; detail: string };

const LOOK: Record<Status, [IconName, string?]> = {
  queued: ["queued"],
  sending: ["loading", "motion-safe:animate-spin"],
  done: ["success"],
  error: ["error", "text-danger"],
  cancelled: ["warning"],
};
const STEP: Partial<Record<string, number>> = { dragenter: 1, dragleave: -1 };
const ACCEPT = rag.ACCEPTED.join(",");
const DUPLICATE = "Nome repetido neste envio: o segundo substituiria o primeiro no RAG.";
const pending = (entry: Entry) => entry.status === "queued" || entry.status === "sending";
// Como o servidor limpa o título: controle e invisível (override bidi) não disfarçam o nome.
const visible = (name: string) => name.replace(/[\p{Cc}\p{Cf}]/gu, "");
const isFileDrag = (event: { dataTransfer: DataTransfer | null }) =>
  !!event.dataTransfer?.types.includes("Files");

export type FileUploadProps = {
  /** URL da rota de indexação; o padrão é a mesma origem (atrás de um proxy). */
  url?: string;
  /** Quem envia cada arquivo; a história troca por um falso. */
  send?: typeof rag.indexDocument;
};

/** Arrastar (ou escolher pelo botão) arquivos de texto para o RAG, um envio por vez. */
export function FileUpload({ url = rag.INDEX_PATH, send = rag.indexDocument }: FileUploadProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [over, setOver] = useState(false);
  const queue = useRef<{ id: number; file: File }[]>([]);
  const running = useRef<AbortController | null>(null);
  const depth = useRef(0); // entrar num filho dá dragleave na área: conta a profundidade
  const ids = useRef(0);
  const picker = useRef<HTMLInputElement>(null);
  const chooser = useRef<HTMLButtonElement>(null);

  const mark = (match: (id: number) => boolean, status: Status, detail: string) =>
    setEntries((list) => list.map((e) => (match(e.id) ? { ...e, status, detail } : e)));

  // Um arquivo por vez: o servidor gera os embeddings de cada um dentro do pedido.
  async function pump() {
    if (running.current) return;
    const abort = new AbortController();
    running.current = abort;
    while (!abort.signal.aborted) {
      const job = queue.current.shift();
      if (!job) break;
      const only = (id: number) => id === job.id;
      mark(only, "sending", "Enviando…");
      try {
        const doc = { name: job.file.name, content: await rag.readText(job.file) };
        const { chunksCreated: n } = await send(url, doc, abort.signal);
        const chunks = n === 1 ? "1 trecho" : `${n} trechos`;
        mark(only, "done", n ? `Indexado: ${chunks}.` : "Sem mudança: já estava indexado.");
      } catch (error) {
        const reason = error instanceof rag.IndexError ? error.message : "Falha no envio.";
        if (abort.signal.aborted)
          mark(only, "cancelled", "Cancelado; o serviço pode ter concluído.");
        else mark(only, "error", reason);
      }
    }
    if (running.current === abort) running.current = null;
  }

  function add(files: Iterable<File>) {
    const seen = new Set<string>();
    const added = Array.from(files, (file): Entry => {
      const id = ids.current++;
      const uri = rag.sourceUriOf(file.name);
      const refusal = rag.precheck(file) ?? (seen.has(uri) ? DUPLICATE : null);
      seen.add(uri);
      if (!refusal) queue.current.push({ id, file });
      const status = refusal ? "error" : "queued";
      return { id, name: file.name, status, detail: refusal ?? "Na fila." };
    });
    setEntries((list) => [...list, ...added]);
    void pump();
  }

  function pick(event: ChangeEvent<HTMLInputElement>) {
    add(event.currentTarget.files ?? []);
    event.currentTarget.value = ""; // o mesmo arquivo de novo também dispara change
  }

  function clear() {
    setEntries([]);
    chooser.current?.focus(); // o botão "Limpar lista" some: o foco não cai no body
  }

  function cancel() {
    running.current?.abort();
    running.current = null;
    const dropped = new Set(queue.current.splice(0).map((job) => job.id));
    mark((id) => dropped.has(id), "cancelled", "Cancelado antes do envio.");
  }

  useEffect(() => {
    // Arquivo solto fora da área: sem isto o navegador abre o arquivo no lugar do app.
    const guard = (event: globalThis.DragEvent) => {
      if (!isFileDrag(event) || event.defaultPrevented) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
    };
    for (const type of ["dragover", "drop"] as const) window.addEventListener(type, guard);
    return () => {
      for (const type of ["dragover", "drop"] as const) window.removeEventListener(type, guard);
      running.current?.abort();
      queue.current = [];
    };
  }, []);

  // dragenter/dragover/dragleave/drop da área; arrastar texto ou link segue o normal.
  function onDrag(event: DragEvent) {
    if (!isFileDrag(event)) return;
    if (event.type !== "dragleave") event.preventDefault(); // aceita soltar aqui
    event.dataTransfer.dropEffect = "copy";
    const drop = event.type === "drop";
    depth.current = drop ? 0 : Math.max(0, depth.current + (STEP[event.type] ?? 0));
    setOver(depth.current > 0);
    if (drop) add(event.dataTransfer.files);
  }
  const busy = entries.some(pending);
  const finished = entries.filter((entry) => !pending(entry));
  const [done, total] = [finished.length, entries.length];
  const count = (status: Status) => finished.filter((entry) => entry.status === status).length;
  const tally = `(indexados: ${count("done")}, com erro: ${count("error")})`;
  const summary = total ? `Concluídos ${done} de ${total} ${tally}.` : ""; // status sempre montado

  return (
    <section
      aria-label="Indexar documentos"
      className={cn(
        "flex w-full max-w-xl flex-col gap-3 rounded-lg border-2 border-border border-dashed p-4",
        over && "border-primary bg-accent",
      )}
      onDragEnter={onDrag}
      onDragOver={onDrag}
      onDragLeave={onDrag}
      onDrop={onDrag}
    >
      <p className="text-sm">
        Arraste arquivos .md, .txt ou .json até aqui para indexar no RAG (até 2 MiB cada; PDF ainda
        não). Um arquivo com o mesmo nome substitui a versão já indexada.
      </p>
      <div className="flex items-center gap-2">
        <Button ref={chooser} variant="secondary" size="sm" onClick={() => picker.current?.click()}>
          <Icon name="add" />
          Escolher arquivos
        </Button>
        {entries.length > 0 && (
          <Button variant="ghost" size="sm" onClick={busy ? cancel : clear}>
            {busy ? "Cancelar envio" : "Limpar lista"}
          </Button>
        )}
      </div>
      <input ref={picker} type="file" multiple hidden accept={ACCEPT} onChange={pick} />
      <p role="status" className="text-sm">
        {summary}
      </p>
      <ul aria-label="Arquivos" className="flex flex-col gap-1 text-sm">
        {entries.map(({ id, name, status, detail }) => (
          <li key={id} className="flex items-start gap-2">
            <Icon name={LOOK[status][0]} className={cn("mt-0.5 shrink-0", LOOK[status][1])} />
            <p className="min-w-0 [overflow-wrap:anywhere]">
              <span className="font-medium">{visible(name)}</span>{" "}
              <span className="text-muted-foreground">{detail}</span>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
