import type { ChatMessage } from "../../../../src/types/domain.ts";
import { ExportButtons } from "../components/export-buttons.tsx";
import type { ExportFormat } from "./chat-file.ts";

type ChatFileModule = typeof import("./chat-file.ts");
/** O serializador vem sob demanda, no primeiro clique: fora do bundle principal. */
export const loadChatFile = (): Promise<ChatFileModule> => import("./chat-file.ts");

export type ExportChatProps = {
  messages: readonly ChatMessage[];
  load?: () => Promise<ChatFileModule>;
};

const FORMATS: Record<ExportFormat, string> = { markdown: "Markdown", json: "JSON" };

/** Botões de exportar; o painel de chat (PR 54 do Luan) passa as mensagens da sessão. */
export function ExportChat({ messages, load = loadChatFile }: ExportChatProps) {
  const save = async (format: ExportFormat) =>
    (await load()).saveChat(messages, format, { now: new Date() });
  return (
    <ExportButtons
      label="Exportar conversa"
      formats={FORMATS}
      disabled={!messages.length}
      save={save}
    />
  );
}
