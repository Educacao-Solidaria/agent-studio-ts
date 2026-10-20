import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "../../../../src/types/domain.ts";
import { ExportChat, loadChatFile } from "./export-chat.tsx";

const messages: ChatMessage[] = [
  { id: "1", role: "user", content: "Oi", timestamp: Date.UTC(2026, 9, 20, 16) },
  { id: "2", role: "assistant", content: "Olá!", timestamp: Date.UTC(2026, 9, 20, 16, 1) },
];

describe("ExportChat", () => {
  const blobs: Blob[] = [];
  const names: string[] = [];
  // Aquece o import(): o waitFor (1 s) não fica à mercê da transformação num runner lento.
  beforeAll(() => loadChatFile());
  beforeEach(() => {
    blobs.length = names.length = 0;
    const createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return "blob:conversa";
    });
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      names.push(this.download);
    });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 20, 15, 30));
  });
  afterEach(() => vi.useRealTimers());
  const button = (name: string) => screen.getByRole("button", { name });

  it("sem mensagens os dois botões ficam desligados", () => {
    render(<ExportChat messages={[]} />);
    for (const name of ["Markdown", "JSON"]) expect(button(name).matches(":disabled")).toBe(true);
  });

  it("baixa conversa-AAAA-MM-DD.md e .json com a sessão inteira", async () => {
    render(<ExportChat messages={messages} />);
    fireEvent.click(button("Markdown"));
    await waitFor(() => expect(names).toEqual(["conversa-2026-10-20.md"]));
    fireEvent.click(button("JSON"));
    await waitFor(() => expect(names).toHaveLength(2));
    expect(names).toEqual(["conversa-2026-10-20.md", "conversa-2026-10-20.json"]);
    expect(blobs.map((b) => b.type)).toEqual(["text/markdown;charset=utf-8", "application/json"]);
    expect(await blobs[0]?.text()).toMatch(/^# Conversa exportada\n[\s\S]*## 2\. Assistente/);
    expect(JSON.parse((await blobs[1]?.text()) ?? "").messages).toHaveLength(2);
  });

  it("falha ao baixar o serializador vira aviso, e tentar de novo funciona", async () => {
    const load = vi.fn(loadChatFile).mockRejectedValueOnce(new Error("rede"));
    render(<ExportChat messages={messages} load={load} />);
    fireEvent.click(button("JSON"));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Não foi possível exportar. Tente de novo.",
    );
    expect(names).toEqual([]);
    fireEvent.click(button("JSON"));
    await waitFor(() => expect(names).toEqual(["conversa-2026-10-20.json"]));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
