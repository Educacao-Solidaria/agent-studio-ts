import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { delay, HttpResponse, http } from "msw";
import { expect, it, vi } from "vitest";
import { server } from "../mocks/node.ts";
import { renderWithProviders } from "../test/render.tsx";
import { FileUpload } from "./file-upload.tsx";

const URL = "http://rag.test/api/v1/index";
const created = (chunks: number) =>
  HttpResponse.json({ document_id: "d", chunks_created: chunks, success: true }, { status: 201 });
const files = (list: File[], types = ["Files"]) => ({ dataTransfer: { files: list, types } });
const named = (...names: string[]) => names.map((name) => new File([name], name));
const zone = () => screen.getByRole("region", { name: "Indexar documentos" });
const status = () => screen.getByRole("status").textContent;
const row = (name: string) => screen.getByText(name).closest("li")?.textContent;

it("envia um arquivo por vez e mostra o resultado de cada um", async () => {
  const log: string[] = []; // +início e -fim de cada pedido
  server.use(
    http.post(URL, async ({ request }) => {
      const { title } = (await request.json()) as { title: string };
      log.push(`+${title}`);
      await delay(5);
      log.push(`-${title}`);
      if (title !== "ruim.txt") return created(title === "igual.json" ? 0 : 4);
      const error = { code: "validation_error", message: "content vazio depois da limpeza" };
      return HttpResponse.json({ error }, { status: 422 });
    }),
  );
  renderWithProviders(<FileUpload url={URL} />);
  fireEvent.drop(
    zone(),
    files(named("guia.md", "manual.pdf", "ruim.txt", "igual.json", "fatura\u202Edm.txt")),
  );
  await waitFor(() => expect(status()).toBe("Concluídos 5 de 5 (indexados: 3, com erro: 2)."));
  const order = ["guia.md", "ruim.txt", "igual.json", "fatura\u202Edm.txt"]; // o PDF nem sai
  expect(log).toEqual(order.flatMap((title) => [`+${title}`, `-${title}`])); // um por vez, em ordem
  expect(row("guia.md")).toContain("Indexado: 4 trechos.");
  expect(screen.getByText("faturadm.txt")).toBeTruthy(); // sem o override bidi do nome
  expect(row("manual.pdf")).toContain("PDF ainda não é aceito");
  expect(row("ruim.txt")).toContain("content vazio depois da limpeza");
  expect(row("igual.json")).toContain("Sem mudança: já estava indexado.");
});

it("pelo teclado: o botão abre o seletor; nome repetido no mesmo envio é recusado", async () => {
  server.use(http.post(URL, () => created(1)));
  const click = vi.spyOn(HTMLInputElement.prototype, "click");
  const { user, container } = renderWithProviders(<FileUpload url={URL} />);
  screen.getByRole("button", { name: "Escolher arquivos" }).focus();
  await user.keyboard("{Enter}");
  expect(click).toHaveBeenCalledTimes(1);
  const input = container.querySelector("input[type=file]") as HTMLInputElement;
  expect(input.accept).toBe(".md,.txt,.json");
  await user.upload(input, [new File(["a"], "a.md"), new File(["b"], "a.md")]);
  await waitFor(() => expect(status()).toBe("Concluídos 2 de 2 (indexados: 1, com erro: 1)."));
  expect(screen.getByText(/o segundo substituiria o primeiro/)).toBeTruthy();
  expect(input.value).toBe(""); // escolher o mesmo arquivo de novo dispara change
  await user.upload(input, new File(["c"], "a.md")); // terminado, o laço aceita outro envio
  await waitFor(() => expect(status()).toBe("Concluídos 3 de 3 (indexados: 2, com erro: 1)."));
  expect(screen.getAllByText("Indexado: 1 trecho.")).toHaveLength(2);
});

it("cancelar fecha o pedido em curso, tira a fila e não trava o envio seguinte", async () => {
  const signals: AbortSignal[] = []; // "lento*" fica preso até o cliente fechar a conexão
  server.use(
    http.post(URL, async ({ request }) => {
      const { title } = (await request.json()) as { title: string };
      if (!title.startsWith("lento")) return created(2);
      signals.push(request.signal);
      await new Promise((done) => request.signal.addEventListener("abort", done));
      return created(1);
    }),
  );
  const { user, unmount } = renderWithProviders(<FileUpload url={URL} />);
  const cancel = () => fireEvent.click(screen.getByRole("button", { name: "Cancelar envio" }));
  fireEvent.drop(zone(), files(named("lento1.md")));
  await waitFor(() => expect(signals).toHaveLength(1));
  fireEvent.drop(zone(), files(named("fila1.md"))); // espera o lento, não corre junto
  expect(row("lento1.md")).toContain("Enviando…");
  cancel(); // e soltar de novo na mesma volta, antes de o laço cancelado acordar:
  fireEvent.drop(zone(), files(named("lento2.md", "fila2.md")));
  await waitFor(() => expect(signals).toHaveLength(2)); // o laço velho não pegou a fila nova
  cancel(); // nem soltou o controle do laço novo
  expect(signals.map((signal) => signal.aborted)).toEqual([true, true]);
  for (const name of ["fila1.md", "fila2.md"]) expect(row(name)).toContain("Cancelado antes");
  await waitFor(() => expect(row("lento2.md")).toContain("o serviço pode ter concluído"));
  fireEvent.drop(zone(), files(named("depois.md")));
  await waitFor(() => expect(row("depois.md")).toContain("Indexado: 2 trechos."));
  await user.click(screen.getByRole("button", { name: "Limpar lista" }));
  expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  fireEvent.drop(zone(), files(named("lento3.md")));
  await waitFor(() => expect(signals).toHaveLength(3));
  unmount(); // desmontar também fecha o pedido em curso
  await waitFor(() => expect(signals[2]?.aborted).toBe(true));
});

it("destaca só arrastando arquivo; solto fora da área, o navegador não abre o arquivo", () => {
  renderWithProviders(<FileUpload url={URL} />);
  const child = within(zone()).getByRole("button", { name: "Escolher arquivos" });
  fireEvent.dragEnter(zone(), files([], ["text/plain"]));
  expect(zone().className).not.toContain("border-primary");
  fireEvent.dragEnter(zone(), files([]));
  fireEvent.dragEnter(child, files([]));
  fireEvent.dragLeave(zone(), files([]));
  expect(zone().className).toContain("border-primary"); // passou para um filho: segue aceso
  fireEvent.dragLeave(child, files([]));
  expect(zone().className).not.toContain("border-primary");
  const over = files([]);
  expect(fireEvent.dragOver(zone(), over)).toBe(false); // sem isto o navegador não solta
  expect(over.dataTransfer).toMatchObject({ dropEffect: "copy" }); // a guarda da janela não zera
  fireEvent.dragEnter(zone(), over);
  fireEvent.drop(zone(), over);
  expect(zone().className).not.toContain("border-primary");
  // fireEvent devolve false quando alguém chamou preventDefault.
  expect(fireEvent.drop(document.body, files(named("a.md")))).toBe(false);
  expect(fireEvent.dragOver(document.body, files([]))).toBe(false);
  expect(fireEvent.drop(document.body, files([], ["text/plain"]))).toBe(true);
  expect(screen.queryAllByRole("listitem")).toHaveLength(0);
});
