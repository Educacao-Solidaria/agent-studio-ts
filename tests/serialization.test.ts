import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clonePipeline,
  deserializePipeline,
  SerializationError,
  serializePipeline,
} from '../src/serialization/graphSerializer.ts';
import type { StudioEdge, StudioNode } from '../src/types/domain.ts';

test('Serialization: serializa e desserializa pipeline preservando dados', () => {
  const nodes: StudioNode[] = [
    {
      id: 'cache-1',
      type: 'cache',
      position: { x: 50, y: 100 },
      state: 'running',
      data: { similarityThreshold: 0.95 },
      lastExecutionDurationMs: 40,
    },
    {
      id: 'gateway-1',
      type: 'gateway',
      position: { x: 250, y: 100 },
      state: 'idle',
      data: { model: 'deepseek-v3' },
    },
  ];

  const edges: StudioEdge[] = [
    { id: 'edge-1', source: 'cache-1', target: 'gateway-1', animated: true },
  ];

  const jsonStr = serializePipeline({
    name: 'Fluxo Cache Gateway',
    description: 'Pipeline de alta performance com cache semântico',
    nodes,
    edges,
    viewport: { x: 10, y: 10, zoom: 1.2 },
  });

  const parsed = deserializePipeline(jsonStr);
  assert.equal(parsed.version, '1.0.0');
  assert.equal(parsed.name, 'Fluxo Cache Gateway');
  assert.equal(parsed.nodes.length, 2);
  assert.equal(parsed.edges.length, 1);
  assert.equal(parsed.viewport.zoom, 1.2);

  // Garante que o estado de execução foi resetado para 'idle' na exportação
  assert.equal(parsed.nodes[0].state, 'idle');
  assert.equal(parsed.nodes[0].lastExecutionDurationMs, undefined);
});

test('Serialization: rejeita JSON malformatado', () => {
  assert.throws(
    () => {
      deserializePipeline('{ chave_invalida: 123');
    },
    (err: unknown) => err instanceof SerializationError && /JSON malformatado/.test(err.message)
  );
});

test('Serialization: rejeita aresta apontando para nó inexistente', () => {
  const invalidJson = JSON.stringify({
    version: '1.0.0',
    id: 'pipe-invalid',
    name: 'Pipeline Inválido',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      {
        id: 'node-a',
        type: 'prompt',
        position: { x: 0, y: 0 },
        state: 'idle',
        data: {},
      },
    ],
    edges: [
      {
        id: 'edge-bad',
        source: 'node-a',
        target: 'node-inexistente',
      },
    ],
  });

  assert.throws(
    () => {
      deserializePipeline(invalidJson);
    },
    (err: unknown) =>
      err instanceof SerializationError && /referencia nó de destino inexistente/.test(err.message)
  );
});

test('Serialization: clonePipeline duplica grafo com novos IDs', () => {
  const original = deserializePipeline(
    serializePipeline({
      name: 'Pipeline Original',
      nodes: [
        { id: 'n1', type: 'rag', position: { x: 0, y: 0 }, state: 'idle', data: {} },
        { id: 'n2', type: 'gateway', position: { x: 100, y: 0 }, state: 'idle', data: {} },
      ],
      edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
    })
  );

  const clone = clonePipeline(original);
  assert.equal(clone.name, 'Pipeline Original (Cópia)');
  assert.notEqual(clone.id, original.id);
  assert.notEqual(clone.nodes[0].id, original.nodes[0].id);
  assert.notEqual(clone.edges[0].id, original.edges[0].id);

  // Aresta clonada deve apontar para os novos IDs dos nós clonados
  assert.equal(clone.edges[0].source, clone.nodes[0].id);
  assert.equal(clone.edges[0].target, clone.nodes[1].id);
});
