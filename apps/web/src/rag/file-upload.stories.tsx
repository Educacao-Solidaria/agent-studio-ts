import type { Meta, StoryObj } from "@storybook/react-vite";
import { FileUpload } from "./file-upload.tsx";
import { IndexError, type indexDocument } from "./index-document.ts";

/** `POST /api/v1/index` falso: 1,2 s por arquivo; nome com "erro" volta como o 422 do serviço. */
const send: typeof indexDocument = async (_url, { name, content }, signal) => {
  await new Promise((done) => setTimeout(done, 1200));
  signal?.throwIfAborted();
  if (name.includes("erro")) throw new IndexError("content vazio depois da limpeza");
  return { documentId: "doc", chunksCreated: Math.ceil(content.length / 2000) };
};

const meta = {
  title: "RAG/FileUpload",
  component: FileUpload,
  args: { send },
} satisfies Meta<typeof FileUpload>;
export default meta;

/** Arraste arquivos (ou use o botão): o envio é simulado, nada sai da página. */
export const Default: StoryObj<typeof meta> = {};
