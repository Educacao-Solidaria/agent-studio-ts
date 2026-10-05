import test from 'node:test';
import assert from 'node:assert';
import { NodeStateMachine } from '../src/state/stateMachine.ts';
import type { ChatMessage, StudioNode } from '../src/types/domain.ts';

test('NodeStateMachine: initial state is idle', () => {
  const sm = new NodeStateMachine();
  assert.strictEqual(sm.getState('node-1'), 'idle');
});

test('NodeStateMachine: allows valid transitions idle -> queued -> running -> success', () => {
  const sm = new NodeStateMachine();
  const transitions: string[] = [];

  sm.subscribe((nodeId, from, to) => {
    transitions.push(`${nodeId}:${from}->${to}`);
  });

  sm.transition('node-1', 'queued');
  assert.strictEqual(sm.getState('node-1'), 'queued');

  sm.transition('node-1', 'running');
  assert.strictEqual(sm.getState('node-1'), 'running');

  sm.transition('node-1', 'success');
  assert.strictEqual(sm.getState('node-1'), 'success');

  assert.deepStrictEqual(transitions, [
    'node-1:idle->queued',
    'node-1:queued->running',
    'node-1:running->success',
  ]);
});

test('NodeStateMachine: rejects invalid transitions with exception', () => {
  const sm = new NodeStateMachine();

  assert.throws(() => {
    // idle não pode ir direto para success sem rodar
    sm.transition('node-1', 'success');
  }, /Transição inválida/);
});

test('DomainTypes: ChatMessage and StudioNode typing integrity', () => {
  const node: StudioNode = {
    id: 'gateway-node-1',
    type: 'gateway',
    position: { x: 100, y: 200 },
    state: 'idle',
    data: { model: 'deepseek/deepseek-chat' },
  };
  assert.strictEqual(node.type, 'gateway');

  const msg: ChatMessage = {
    id: 'msg-1',
    role: 'user',
    content: 'Consulta de teste',
    timestamp: Date.now(),
  };
  assert.strictEqual(msg.role, 'user');
});
