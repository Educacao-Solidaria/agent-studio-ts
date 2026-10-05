import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSSEBlock,
  StreamChunkSchema,
  StreamErrorSchema,
  StreamMetadataSchema,
  StreamToolCallSchema,
} from '../src/types/sse.ts';

test('SSE: parseSSEBlock decodifica evento de chunk incremental', () => {
  const raw = [
    'id: chunk-001',
    'event: chunk',
    'data: {"id":"c1","model":"deepseek-v3","delta_content":"Olá mundo","is_last":false}',
  ].join('\n');

  const parsed = parseSSEBlock(raw);
  assert.ok(parsed);
  assert.equal(parsed.event, 'chunk');
  assert.equal(parsed.id, 'chunk-001');
  assert.equal(parsed.data.delta_content, 'Olá mundo');
  assert.equal(parsed.data.is_last, false);
});

test('SSE: parseSSEBlock decodifica evento de telemetria/metadata', () => {
  const raw = [
    'event: metadata',
    'data: {"ttft_ms":42.5,"total_duration_ms":120.0,"prompt_tokens":15,"completion_tokens":25,"total_tokens":40,"cached":true,"model":"gpt-4o"}',
  ].join('\n');

  const parsed = parseSSEBlock(raw);
  assert.ok(parsed);
  assert.equal(parsed.event, 'metadata');
  assert.equal(parsed.data.ttft_ms, 42.5);
  assert.equal(parsed.data.cached, true);
  assert.equal(parsed.data.total_tokens, 40);
});

test('SSE: parseSSEBlock decodifica evento de tool_call', () => {
  const raw = [
    'event: tool_call',
    'data: {"index":0,"id":"call-1","name":"hybrid_search","arguments_delta":"{\\"query\\":\\"fies\\"}"}',
  ].join('\n');

  const parsed = parseSSEBlock(raw);
  assert.ok(parsed);
  assert.equal(parsed.event, 'tool_call');
  assert.equal(parsed.data.name, 'hybrid_search');
  assert.equal(parsed.data.index, 0);
});

test('SSE: parseSSEBlock decodifica evento de erro', () => {
  const raw = [
    'event: error',
    'data: {"code":"RATE_LIMIT_EXCEEDED","message":"Muitas requisições","retryable":true}',
  ].join('\n');

  const parsed = parseSSEBlock(raw);
  assert.ok(parsed);
  assert.equal(parsed.event, 'error');
  assert.equal(parsed.data.code, 'RATE_LIMIT_EXCEEDED');
  assert.equal(parsed.data.retryable, true);
});

test('SSE: StreamChunkSchema rejeita payload invalido', () => {
  assert.throws(() => {
    // falta campo obrigatório model
    StreamChunkSchema.parse({
      id: 'c1',
      delta_content: 'texto',
      is_last: true,
    });
  });
});

test('SSE: StreamMetadataSchema rejeita valores negativos', () => {
  assert.throws(() => {
    StreamMetadataSchema.parse({
      ttft_ms: -10,
      total_duration_ms: 100,
      prompt_tokens: 5,
      completion_tokens: 5,
      total_tokens: 10,
      cached: false,
      model: 'test',
    });
  });
});

test('SSE: parseSSEBlock retorna null para dados malformatados', () => {
  assert.equal(parseSSEBlock('texto puro sem estrutura SSE'), null);
  assert.equal(parseSSEBlock('event: chunk\ndata: {invalido json}\n'), null);
  assert.equal(parseSSEBlock('event: evento_inexistente\ndata: {"test":1}\n'), null);
});
