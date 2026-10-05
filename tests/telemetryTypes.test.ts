import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateTraceMetrics,
  createExecutionSpan,
  NodeExecutionSpanSchema,
  PipelineExecutionTraceSchema,
} from '../src/types/telemetry.ts';

test('Telemetry: createExecutionSpan calcula duracao e valida campos', () => {
  const span = createExecutionSpan({
    spanId: 'span-1',
    nodeId: 'node-cache',
    nodeType: 'cache',
    startTimeMs: 1000,
    endTimeMs: 1045,
    status: 'ok',
    cacheMetrics: { hit: true, similarityScore: 0.96, latencySavedMs: 200 },
  });

  assert.equal(span.spanId, 'span-1');
  assert.equal(span.durationMs, 45);
  assert.equal(span.cacheMetrics?.hit, true);
  assert.equal(span.cacheMetrics?.similarityScore, 0.96);
});

test('Telemetry: aggregateTraceMetrics computa totais de tokens, custos e duracao', () => {
  const span1 = createExecutionSpan({
    spanId: 's1',
    nodeId: 'n1',
    nodeType: 'rag',
    startTimeMs: 100,
    endTimeMs: 250,
    status: 'ok',
    tokenMetrics: { promptTokens: 50, completionTokens: 0, totalTokens: 50 },
    costMetrics: { estimatedCostUsd: 0.0001 },
  });

  const span2 = createExecutionSpan({
    spanId: 's2',
    nodeId: 'n2',
    nodeType: 'gateway',
    parentSpanId: 's1',
    startTimeMs: 250,
    endTimeMs: 500,
    status: 'ok',
    tokenMetrics: { promptTokens: 60, completionTokens: 140, totalTokens: 200 },
    costMetrics: { estimatedCostUsd: 0.0015 },
  });

  const summary = aggregateTraceMetrics([span1, span2]);
  assert.equal(summary.totalDurationMs, 400); // 500 - 100
  assert.equal(summary.totalTokens, 250);
  assert.equal(summary.totalEstimatedCostUsd, 0.0016);
});

test('Telemetry: aggregateTraceMetrics com lista vazia retorna zeros', () => {
  const summary = aggregateTraceMetrics([]);
  assert.equal(summary.totalDurationMs, 0);
  assert.equal(summary.totalTokens, 0);
  assert.equal(summary.totalEstimatedCostUsd, 0);
});

test('Telemetry: PipelineExecutionTraceSchema valida rastreio estruturado', () => {
  const trace = {
    traceId: 'trace-123',
    pipelineId: 'pipe-abc',
    startTimeMs: 0,
    endTimeMs: 300,
    totalDurationMs: 300,
    totalTokens: 100,
    totalEstimatedCostUsd: 0.0005,
    spans: [
      {
        spanId: 'span-x',
        nodeId: 'node-x',
        nodeType: 'gateway' as const,
        startTimeMs: 0,
        endTimeMs: 300,
        durationMs: 300,
        status: 'ok' as const,
      },
    ],
  };

  const validated = PipelineExecutionTraceSchema.parse(trace);
  assert.equal(validated.traceId, 'trace-123');
  assert.equal(validated.spans.length, 1);
});

test('Telemetry: NodeExecutionSpanSchema rejeita tipo de nó desconhecido', () => {
  assert.throws(() => {
    NodeExecutionSpanSchema.parse({
      spanId: 's-inv',
      nodeId: 'n-inv',
      nodeType: 'tipo_desconhecido',
      startTimeMs: 0,
      endTimeMs: 10,
      durationMs: 10,
      status: 'ok',
    });
  });
});
