import test from 'node:test';
import assert from 'node:assert/strict';
import type { StudioEdge, StudioNode } from '../src/types/domain.ts';
import type { CacheNodeConfig, GatewayNodeConfig, RagNodeConfig } from '../src/types/nodes.ts';
import { ExecutionGraph } from '../src/graph/executionGraph.ts';

test('ExecutionGraph: valida pipeline linear valida (Cache -> RAG -> Gateway)', () => {
  const cacheConfig: CacheNodeConfig = {
    similarityThreshold: 0.85,
    maxEntries: 10000,
    ttlSeconds: 3600,
    evictPolicy: 'lru',
  };

  const ragConfig: RagNodeConfig = {
    collectionName: 'knowledge-base',
    topK: 5,
    minScore: 0.7,
    searchMode: 'hybrid',
    rerank: true,
  };

  const gatewayConfig: GatewayNodeConfig = {
    model: 'anthropic/claude-3.5-sonnet',
    temperature: 0.2,
    fallbackModels: ['openai/gpt-4o-mini'],
    stream: true,
    timeoutMs: 30000,
  };

  const nodes: StudioNode[] = [
    { id: 'node-cache', type: 'cache', position: { x: 0, y: 0 }, state: 'idle', data: cacheConfig },
    { id: 'node-rag', type: 'rag', position: { x: 200, y: 0 }, state: 'idle', data: ragConfig },
    { id: 'node-gateway', type: 'gateway', position: { x: 400, y: 0 }, state: 'idle', data: gatewayConfig },
  ];

  const edges: StudioEdge[] = [
    { id: 'e1', source: 'node-cache', target: 'node-rag' },
    { id: 'e2', source: 'node-rag', target: 'node-gateway' },
  ];

  const graph = new ExecutionGraph(nodes, edges);
  const validation = graph.validate();

  assert.equal(validation.valid, true);
  assert.equal(validation.errors.length, 0);

  const order = graph.getTopologicalOrder();
  assert.deepEqual(order, ['node-cache', 'node-rag', 'node-gateway']);

  const roots = graph.getRootNodes();
  assert.equal(roots.length, 1);
  assert.equal(roots[0].id, 'node-cache');
});

test('ExecutionGraph: detecta ciclo direcionado e rejeita ordenacao topologica', () => {
  const nodes: StudioNode[] = [
    { id: 'a', type: 'prompt', position: { x: 0, y: 0 }, state: 'idle', data: {} },
    { id: 'b', type: 'gateway', position: { x: 100, y: 0 }, state: 'idle', data: {} },
  ];

  const edges: StudioEdge[] = [
    { id: 'e1', source: 'a', target: 'b' },
    { id: 'e2', source: 'b', target: 'a' }, // Ciclo
  ];

  const graph = new ExecutionGraph(nodes, edges);
  const validation = graph.validate();

  assert.equal(validation.valid, false);
  assert.equal(graph.detectCycle(), true);
  assert.throws(() => graph.getTopologicalOrder(), /contem ciclos/);
});

test('ExecutionGraph: acusa aresta com nos inexistentes', () => {
  const nodes: StudioNode[] = [
    { id: 'node-1', type: 'prompt', position: { x: 0, y: 0 }, state: 'idle', data: {} },
  ];

  const edges: StudioEdge[] = [
    { id: 'e1', source: 'node-1', target: 'node-fantasma' },
  ];

  const graph = new ExecutionGraph(nodes, edges);
  const validation = graph.validate();

  assert.equal(validation.valid, false);
  assert.match(validation.errors[0], /destino inexistente: node-fantasma/);
});
