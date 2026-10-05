import { z } from 'zod';

/**
 * Payload emitido em cada pedaço incremental de texto durante streaming.
 * Alinhado estritamente com o `StreamChunk` do flow-gateway-go.
 */
export const StreamChunkSchema = z.object({
  id: z.string().min(1),
  model: z.string().min(1),
  delta_content: z.string(),
  finish_reason: z.string().optional(),
  is_last: z.boolean(),
});
export type StreamChunkPayload = z.infer<typeof StreamChunkSchema>;

/**
 * Metadados de telemetria emitidos no início ou término do streaming.
 */
export const StreamMetadataSchema = z.object({
  ttft_ms: z.number().nonnegative(),
  total_duration_ms: z.number().nonnegative(),
  prompt_tokens: z.number().int().nonnegative(),
  completion_tokens: z.number().int().nonnegative(),
  total_tokens: z.number().int().nonnegative(),
  cached: z.boolean(),
  model: z.string().min(1),
});
export type StreamMetadataPayload = z.infer<typeof StreamMetadataSchema>;

/**
 * Evento de fragmento ou emissão de Tool Call durante streaming.
 */
export const StreamToolCallSchema = z.object({
  index: z.number().int().nonnegative(),
  id: z.string().min(1),
  name: z.string().min(1),
  arguments_delta: z.string(),
});
export type StreamToolCallPayload = z.infer<typeof StreamToolCallSchema>;

/**
 * Evento de erro emitido pelo gateway durante o fluxo SSE.
 */
export const StreamErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  retryable: z.boolean(),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type StreamErrorPayload = z.infer<typeof StreamErrorSchema>;

/**
 * Evento de encerramento do stream.
 */
export const StreamDoneSchema = z.object({
  finish_reason: z.string().min(1),
  total_tokens: z.number().int().nonnegative(),
  duration_ms: z.number().nonnegative(),
});
export type StreamDonePayload = z.infer<typeof StreamDoneSchema>;

/**
 * União discriminada de todos os eventos Server-Sent Events recebidos do Gateway.
 */
export type SSEEvent =
  | { event: 'chunk'; data: StreamChunkPayload; id?: string }
  | { event: 'metadata'; data: StreamMetadataPayload; id?: string }
  | { event: 'tool_call'; data: StreamToolCallPayload; id?: string }
  | { event: 'error'; data: StreamErrorPayload; id?: string }
  | { event: 'done'; data: StreamDonePayload; id?: string };

/**
 * Parser determinístico para decodificar mensagens no formato padrão SSE.
 * Recebe bloco de texto no formato `event: ...\ndata: ...\n\n` e valida com Zod.
 */
export function parseSSEBlock(rawBlock: string): SSEEvent | null {
  const lines = rawBlock.split('\n');
  let eventType = 'chunk';
  let dataStr = '';
  let id: string | undefined;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('event:')) {
      eventType = trimmed.slice(6).trim();
    } else if (trimmed.startsWith('data:')) {
      dataStr = trimmed.slice(5).trim();
    } else if (trimmed.startsWith('id:')) {
      id = trimmed.slice(3).trim();
    }
  }

  if (!dataStr) return null;

  try {
    const json = JSON.parse(dataStr);
    switch (eventType) {
      case 'chunk': {
        const data = StreamChunkSchema.parse(json);
        return { event: 'chunk', data, id };
      }
      case 'metadata': {
        const data = StreamMetadataSchema.parse(json);
        return { event: 'metadata', data, id };
      }
      case 'tool_call': {
        const data = StreamToolCallSchema.parse(json);
        return { event: 'tool_call', data, id };
      }
      case 'error': {
        const data = StreamErrorSchema.parse(json);
        return { event: 'error', data, id };
      }
      case 'done': {
        const data = StreamDoneSchema.parse(json);
        return { event: 'done', data, id };
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}
