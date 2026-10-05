import test from 'node:test';
import assert from 'node:assert/strict';
import { NodeStateMachine, type NodeTransitionEvent } from '../src/state/stateMachine.ts';

test('NodeStateMachine: mede duracao de execucao entre running e success', async () => {
  const sm = new NodeStateMachine();
  const events: NodeTransitionEvent[] = [];

  sm.subscribeDetailed((ev) => events.push(ev));

  sm.transition('node-calc', 'queued');
  sm.transition('node-calc', 'running');

  // Simula um atraso de 15ms
  await new Promise((resolve) => setTimeout(resolve, 20));

  sm.transition('node-calc', 'success');

  const duration = sm.getExecutionDuration('node-calc');
  assert.ok(duration !== undefined && duration >= 15);

  const history = sm.getHistory('node-calc');
  assert.equal(history.length, 3);
  assert.equal(history[2].to, 'success');
  assert.ok(history[2].durationMs !== undefined && history[2].durationMs >= 15);
});

test('NodeStateMachine: timeout automatico transiciona nó para error', async () => {
  const sm = new NodeStateMachine();
  sm.transition('node-slow', 'running');

  // Configura timeout agressivo de 25ms
  sm.setTimeout('node-slow', 25);

  assert.equal(sm.getState('node-slow'), 'running');

  // Aguarda 50ms para disparar o timer
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(sm.getState('node-slow'), 'error');
  const history = sm.getHistory('node-slow');
  const lastEvent = history[history.length - 1];
  assert.equal(lastEvent.to, 'error');
  assert.match(lastEvent.error || '', /Timeout de execucao excedido/);
});

test('NodeStateMachine: clearTimeout cancela timeout se o nó concluir a tempo', async () => {
  const sm = new NodeStateMachine();
  sm.transition('node-fast', 'running');
  sm.setTimeout('node-fast', 100);

  // Conclui rapidamente em 10ms
  await new Promise((resolve) => setTimeout(resolve, 10));
  sm.transition('node-fast', 'success');

  // Aguarda 120ms para garantir que o timeout não vai disparar em cima do success
  await new Promise((resolve) => setTimeout(resolve, 120));

  assert.equal(sm.getState('node-fast'), 'success');
});
