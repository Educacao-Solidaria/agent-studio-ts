import test from 'node:test';
import assert from 'node:assert/strict';

import { ExecutionGraph } from '../src/graph/executionGraph.ts';
import { NodeStateMachine } from '../src/state/stateMachine.ts';
import type { ChatMessage, StudioEdge, StudioNode } from '../src/types/domain.ts';
import {
  CacheNodeConfigSchema,
  EvalNodeConfigSchema,
  GatewayNodeConfigSchema,
  PromptNodeConfigSchema,
  RagNodeConfigSchema,
  StudioNodeSchema,
  validatePipeline,
} from '../src/validation/schemas.ts';

test('Contracts: tipagem e integridade do modelo ChatMessage e ToolCall', () => {
  const msg: ChatMessage = {
    id: 'msg-01',
    role: 'assistant',
    content: 'Processamento concluído com sucesso.',
    timestamp: Date.now(),
    toolCalls: [
      {
        id: 'call-01',
        type: 'function',
        function: {
          name: 'hybrid_search',
          arguments: '{"query":"fies"}',
        },
      },
    ],
    metadata: {
      model: 'deepseek-v3',
      cached: true,
      ttftMs: 38.5,
      totalTokens: 120,
    },
  };

  assert.equal(msg.role, 'assistant');
  assert.equal(msg.toolCalls?.length, 1);
  assert.equal(msg.metadata?.cached, true);
  assert.equal(msg.metadata?.ttftMs, 38.5);
});

test('Contracts: schemas de configuracao de nós da Fase 1', () => {
  // 1. Gateway
  const gwConfig = GatewayNodeConfigSchema.parse({
    model: 'openai/gpt-4o-mini',
    temperature: 0.5,
  });
  assert.equal(gwConfig.stream, true); // default
  assert.equal(gwConfig.timeoutMs, 30000); // default
  assert.equal(gwConfig.temperature, 0.5);

  // 2. Cache
  const cacheConfig = CacheNodeConfigSchema.parse({
    similarityThreshold: 0.90,
  });
  assert.equal(cacheConfig.similarityThreshold, 0.90);
  assert.equal(cacheConfig.evictPolicy, 'lru');

  // 3. RAG
  const ragConfig = RagNodeConfigSchema.parse({
    collectionName: 'legislacao-fies',
    searchMode: 'hybrid',
  });
  assert.equal(ragConfig.collectionName, 'legislacao-fies');
  assert.equal(ragConfig.topK, 5);
  assert.equal(ragConfig.rerank, true);

  // 4. Prompt
  const promptConfig = PromptNodeConfigSchema.parse({
    template: 'Você é um assistente do FIES. Pergunta: {{query}}',
    variables: ['query'],
  });
  assert.equal(promptConfig.variables.length, 1);

  // 5. Eval
  const evalConfig = EvalNodeConfigSchema.parse({
    metrics: ['relevance', 'accuracy'],
    minPassScore: 0.85,
  });
  assert.equal(evalConfig.metrics.length, 2);
  assert.equal(evalConfig.minPassScore, 0.85);
});

test('Contracts: validacao de pipeline com validatePipeline', () => {
  const validPipeline = {
    name: 'Pipeline E2E de Atendimento',
    version: '1.0.0',
    nodes: [
      {
        id: 'node-prompt',
        type: 'prompt',
        position: { x: 0, y: 0 },
        data: { template: 'Pergunta' },
      },
      {
        id: 'node-cache',
        type: 'cache',
        position: { x: 200, y: 0 },
        data: {},
      },
      {
        id: 'node-gateway',
        type: 'gateway',
        position: { x: 400, y: 0 },
        data: { model: 'deepseek-v3' },
      },
    ],
    edges: [
      { id: 'e1', source: 'node-prompt', target: 'node-cache' },
      { id: 'e2', source: 'node-cache', target: 'node-gateway' },
    ],
  };

  const res = validatePipeline(validPipeline);
  assert.equal(res.success, true);
  assert.equal(res.data?.nodes.length, 3);
  assert.equal(res.data?.edges.length, 2);

  // Rejeição de pipeline sem nós
  const invalidEmpty = validatePipeline({ name: 'Vazio', nodes: [] });
  assert.equal(invalidEmpty.success, false);
  assert.ok(res.data);
});

test('Contracts: integracao entre ExecutionGraph e NodeStateMachine', () => {
  const nodes: StudioNode[] = [
    { id: 'step-1', type: 'prompt', position: { x: 0, y: 0 }, state: 'idle', data: {} },
    { id: 'step-2', type: 'rag', position: { x: 100, y: 0 }, state: 'idle', data: {} },
    { id: 'step-3', type: 'gateway', position: { x: 200, y: 0 }, state: 'idle', data: {} },
  ];

  const edges: StudioEdge[] = [
    { id: 'e1', source: 'step-1', target: 'step-2' },
    { id: 'e2', source: 'step-2', target: 'step-3' },
  ];

  const graph = new ExecutionGraph(nodes, edges);
  const validation = graph.validate();
  assert.equal(validation.valid, true);

  const order = graph.getTopologicalOrder();
  assert.deepEqual(order, ['step-1', 'step-2', 'step-3']);

  const sm = new NodeStateMachine();
  for (const nodeId of order) {
    assert.equal(sm.getState(nodeId), 'idle');

    sm.transition(nodeId, 'queued');
    assert.equal(sm.getState(nodeId), 'queued');

    sm.transition(nodeId, 'running');
    assert.equal(sm.getState(nodeId), 'running');

    sm.transition(nodeId, 'success');
    assert.equal(sm.getState(nodeId), 'success');
  }
});

test('Contracts: deteccao de loops em grafos direcionados com ExecutionGraph', () => {
  const cyclicNodes: StudioNode[] = [
    { id: 'a', type: 'prompt', position: { x: 0, y: 0 }, state: 'idle', data: {} },
    { id: 'b', type: 'gateway', position: { x: 100, y: 0 }, state: 'idle', data: {} },
  ];
  const cyclicEdges: StudioEdge[] = [
    { id: 'e1', source: 'a', target: 'b' },
    { id: 'e2', source: 'b', target: 'a' },
  ];

  const graph = new ExecutionGraph(cyclicNodes, cyclicEdges);
  const val = graph.validate();
  assert.equal(val.valid, false);
  assert.match(val.errors[0], /contem ciclos/);
});

test('Contracts: StudioNodeSchema aplica defaults e valida limites', () => {
  const rawNode = {
    id: 'n-default',
    type: 'cache',
    position: { x: 15, y: 25 },
  };

  const parsed = StudioNodeSchema.parse(rawNode);
  assert.equal(parsed.state, 'idle'); // default
  assert.deepEqual(parsed.data, {}); // default
});
