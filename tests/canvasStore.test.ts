import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvasStore } from '../src/store/canvasStore.ts';
import type { StudioNode } from '../src/types/domain.ts';

test('CanvasStore: inicializa com valores padrao ou customizados', () => {
  const store = createCanvasStore();
  assert.deepEqual(store.getState().nodes, []);
  assert.deepEqual(store.getState().edges, []);
  assert.equal(store.getState().selectedNodeId, null);
  assert.equal(store.getState().viewport.zoom, 1);
});

test('CanvasStore: addNode adiciona nó e emite notificacao', () => {
  const store = createCanvasStore();
  let calls = 0;
  const unsubscribe = store.subscribe(() => {
    calls++;
  });

  const node: StudioNode = {
    id: 'node-1',
    type: 'gateway',
    position: { x: 100, y: 100 },
    state: 'idle',
    data: { model: 'deepseek-v3' },
  };

  store.addNode(node);
  assert.equal(store.getState().nodes.length, 1);
  assert.equal(store.getState().nodes[0].id, 'node-1');
  assert.equal(calls, 1);

  unsubscribe();
  store.addNode({ ...node, id: 'node-2' });
  assert.equal(calls, 1); // Notificação não deve ser chamada após unsubscribe
});

test('CanvasStore: removeNode limpa nós e arestas associadas', () => {
  const store = createCanvasStore();
  const n1: StudioNode = {
    id: 'n1',
    type: 'prompt',
    position: { x: 0, y: 0 },
    state: 'idle',
    data: {},
  };
  const n2: StudioNode = {
    id: 'n2',
    type: 'gateway',
    position: { x: 200, y: 0 },
    state: 'idle',
    data: {},
  };

  store.addNode(n1);
  store.addNode(n2);
  store.addEdge({ id: 'e1', source: 'n1', target: 'n2' });
  store.selectNode('n1');

  assert.equal(store.getState().nodes.length, 2);
  assert.equal(store.getState().edges.length, 1);
  assert.equal(store.getState().selectedNodeId, 'n1');

  // Removendo n1 deve remover a aresta e desmarcar a seleção
  store.removeNode('n1');
  assert.equal(store.getState().nodes.length, 1);
  assert.equal(store.getState().edges.length, 0);
  assert.equal(store.getState().selectedNodeId, null);
});

test('CanvasStore: addEdge impede auto-conexao', () => {
  const store = createCanvasStore();
  assert.throws(
    () => {
      store.addEdge({ id: 'self-edge', source: 'n1', target: 'n1' });
    },
    /Auto-conexão não permitida/
  );
});

test('CanvasStore: updateNodeData atualiza dados imutavelmente', () => {
  const store = createCanvasStore();
  const n: StudioNode<{ title: string }> = {
    id: 'n-config',
    type: 'rag',
    position: { x: 10, y: 20 },
    state: 'idle',
    data: { title: 'Base Original' },
  };

  store.addNode(n);
  store.updateNodeData('n-config', { title: 'Base Atualizada' });

  const updated = store.getState().nodes.find((item) => item.id === 'n-config');
  assert.equal(updated?.data.title, 'Base Atualizada');
});

test('CanvasStore: undo restaura estado anterior', () => {
  const store = createCanvasStore();
  const n: StudioNode = {
    id: 'n-undo',
    type: 'cache',
    position: { x: 0, y: 0 },
    state: 'idle',
    data: {},
  };

  store.addNode(n);
  assert.equal(store.getState().nodes.length, 1);

  const undid = store.undo();
  assert.equal(undid, true);
  assert.equal(store.getState().nodes.length, 0);

  // Sem mais histórico
  assert.equal(store.undo(), false);
});
