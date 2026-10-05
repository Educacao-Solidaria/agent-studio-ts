import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GatewayNodeConfigSchema,
  CacheNodeConfigSchema,
  RagNodeConfigSchema,
  PipelineGraphSchema,
  validatePipeline,
} from '../src/validation/schemas.ts';

test('GatewayNodeConfigSchema: valida config correta e aplica defaults', () => {
  const parsed = GatewayNodeConfigSchema.parse({
    model: 'deepseek/deepseek-r1',
  });

  assert.equal(parsed.model, 'deepseek/deepseek-r1');
  assert.equal(parsed.temperature, 0.7);
  assert.equal(parsed.stream, true);
  assert.equal(parsed.timeoutMs, 30000);
});

test('GatewayNodeConfigSchema: rejeita temperatura fora dos limites [0, 2]', () => {
  assert.throws(() => {
    GatewayNodeConfigSchema.parse({
      model: 'openai/gpt-4o',
      temperature: 2.5,
    });
  });
});

test('CacheNodeConfigSchema: valida politicas de eviction e threshold', () => {
  const parsed = CacheNodeConfigSchema.parse({
    similarityThreshold: 0.9,
    evictPolicy: 'lru',
  });

  assert.equal(parsed.similarityThreshold, 0.9);
  assert.equal(parsed.evictPolicy, 'lru');
  assert.equal(parsed.maxEntries, 10000);

  assert.throws(() => {
    CacheNodeConfigSchema.parse({
      similarityThreshold: 1.5,
    });
  });
});

test('RagNodeConfigSchema: valida colecao e modos de busca', () => {
  const parsed = RagNodeConfigSchema.parse({
    collectionName: 'kb-solidaria',
    searchMode: 'hybrid',
  });

  assert.equal(parsed.collectionName, 'kb-solidaria');
  assert.equal(parsed.searchMode, 'hybrid');
  assert.equal(parsed.topK, 5);

  assert.throws(() => {
    RagNodeConfigSchema.parse({
      collectionName: '',
    });
  });
});

test('validatePipeline: valida grafo de nos valido', () => {
  const payload = {
    name: 'Pipeline Educacao Solidaria',
    version: '1.0.0',
    nodes: [
      {
        id: 'node-prompt',
        type: 'prompt',
        position: { x: 0, y: 0 },
        data: { template: 'Ola {nome}' },
      },
      {
        id: 'node-gateway',
        type: 'gateway',
        position: { x: 250, y: 0 },
        data: { model: 'anthropic/claude-3.5-sonnet' },
      },
    ],
    edges: [
      { id: 'edge-1', source: 'node-prompt', target: 'node-gateway' },
    ],
  };

  const res = validatePipeline(payload);
  assert.equal(res.success, true);
  assert.ok(res.data);
  assert.equal(res.data.nodes.length, 2);
  assert.equal(res.data.edges.length, 1);
});

test('validatePipeline: rejeita pipeline sem nós', () => {
  const invalid = {
    name: 'Pipeline Vazio',
    nodes: [],
  };

  const res = validatePipeline(invalid);
  assert.equal(res.success, false);
  assert.ok(res.errors && res.errors.length > 0);
  assert.match(res.errors[0], /ao menos um nó/);
});
