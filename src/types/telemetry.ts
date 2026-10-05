import { z } from 'zod';
import type { NodeType } from './domain.ts';

export const TokenMetricsSchema = z.object({
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
});
export type TokenMetrics = z.infer<typeof TokenMetricsSchema>;

export const CostMetricsSchema = z.object({
  estimatedCostUsd: z.number().nonnegative(),
  pricingModel: z.string().optional(),
});
export type CostMetrics = z.infer<typeof CostMetricsSchema>;

export const CacheMetricsSchema = z.object({
  hit: z.boolean(),
  similarityScore: z.number().min(0).max(1).optional(),
  latencySavedMs: z.number().nonnegative().optional(),
});
export type CacheMetrics = z.infer<typeof CacheMetricsSchema>;

export const NodeExecutionSpanSchema = z.object({
  spanId: z.string().min(1),
  nodeId: z.string().min(1),
  nodeType: z.enum(['gateway', 'cache', 'rag', 'prompt', 'eval', 'custom']),
  parentSpanId: z.string().optional(),
  startTimeMs: z.number().nonnegative(),
  endTimeMs: z.number().nonnegative(),
  durationMs: z.number().nonnegative(),
  status: z.enum(['ok', 'error']),
  error: z.string().optional(),
  tokenMetrics: TokenMetricsSchema.optional(),
  costMetrics: CostMetricsSchema.optional(),
  cacheMetrics: CacheMetricsSchema.optional(),
});
export type NodeExecutionSpan = z.infer<typeof NodeExecutionSpanSchema>;

export const PipelineExecutionTraceSchema = z.object({
  traceId: z.string().min(1),
  pipelineId: z.string().min(1),
  startTimeMs: z.number().nonnegative(),
  endTimeMs: z.number().nonnegative(),
  totalDurationMs: z.number().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  totalEstimatedCostUsd: z.number().nonnegative(),
  spans: z.array(NodeExecutionSpanSchema),
});
export type PipelineExecutionTrace = z.infer<typeof PipelineExecutionTraceSchema>;

/**
 * Cria um span de execução a partir dos timestamps com cálculo automático de duração.
 */
export function createExecutionSpan(params: {
  spanId: string;
  nodeId: string;
  nodeType: NodeType;
  parentSpanId?: string;
  startTimeMs: number;
  endTimeMs: number;
  status: 'ok' | 'error';
  error?: string;
  tokenMetrics?: TokenMetrics;
  costMetrics?: CostMetrics;
  cacheMetrics?: CacheMetrics;
}): NodeExecutionSpan {
  const durationMs = Math.max(0, params.endTimeMs - params.startTimeMs);
  return NodeExecutionSpanSchema.parse({
    ...params,
    durationMs,
  });
}

/**
 * Agrega métricas consolidadas a partir de uma coleção de spans.
 */
export function aggregateTraceMetrics(spans: NodeExecutionSpan[]): {
  totalDurationMs: number;
  totalTokens: number;
  totalEstimatedCostUsd: number;
} {
  let totalTokens = 0;
  let totalEstimatedCostUsd = 0;
  let minStart = Infinity;
  let maxEnd = 0;

  for (const span of spans) {
    if (span.startTimeMs < minStart) minStart = span.startTimeMs;
    if (span.endTimeMs > maxEnd) maxEnd = span.endTimeMs;

    if (span.tokenMetrics) {
      totalTokens += span.tokenMetrics.totalTokens;
    }
    if (span.costMetrics) {
      totalEstimatedCostUsd += span.costMetrics.estimatedCostUsd;
    }
  }

  const totalDurationMs = minStart === Infinity ? 0 : Math.max(0, maxEnd - minStart);

  return {
    totalDurationMs,
    totalTokens,
    totalEstimatedCostUsd: Number(totalEstimatedCostUsd.toFixed(6)),
  };
}
