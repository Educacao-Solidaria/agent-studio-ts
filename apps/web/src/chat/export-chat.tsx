import { useState } from "react";
import type { ChatMessage } from "../../../../src/types/domain.ts";
import { Icon } from "../components/icons.tsx";
import { Button } from "../components/ui/button.tsx";
import type { ExportFormat } from "./chat-file.ts";

type ChatFileModule = typeof import("./chat-file.ts");
/** O serializador vem sob demanda, no primeiro clique: fora do bundle principal. */
export const loadChatFile = (): Promise<ChatFileModule> => import("./chat-file.ts");

export type ExportChatProps = {
  messages: readonly ChatMessage[];
  load?: () => Promise<ChatFileModule>;
};

/** Botões de exportar; o painel de chat (PR 54 do Luan) passa as mensagens da sessão. */
export function ExportChat({ messages, load = loadChatFile }: ExportChatProps) {
  const [failed, setFailed] = useState(false);
  const save = async (format: ExportFormat) => {
    try {
      (await load()).saveChat(messages, format, { now: new Date() });
      setFailed(false);
    } catch {
      setFailed(true);
    }
  };
  return (
    <fieldset aria-label="Exportar conversa" disabled={!messages.length} className="flex gap-2">
      <Button variant="secondary" size="sm" onClick={() => save("markdown")}>
        <Icon name="download" />
        Markdown
      </Button>
      <Button variant="secondary" size="sm" onClick={() => save("json")}>
        <Icon name="download" />
        JSON
      </Button>
      {failed && (
        <p role="alert" className="self-center text-danger text-sm">
          Não foi possível exportar. Tente de novo.
        </p>
      )}
    </fieldset>
  );
}
