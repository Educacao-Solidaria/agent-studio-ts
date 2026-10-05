import { z } from 'zod';

export const NodeTypeSchema = z.enum([
  'gateway',
  'cache',
  'rag',
  'prompt',
  'eval',
  'custom',
]);

export const NodeExecutionStateSchema = z.enum([
  'idle',
  'queued',
  'running',
  'success',
  'error',
]);

export const GatewayNodeConfigSchema = z.object({
  model: z.string().min(1, 'Nome do modelo eh obrigatorio'),
  temperature: z.number().min(0).max(2).default(0.7),
  topP: z.number().min(0).max(1).optional(),
  fallbackModels: z.array(z.string()).default([]),
  stream: z.boolean().default(true),
  systemPrompt: z.string().optional(),
  timeoutMs: z.number().positive().default(30000),
});

export const CacheNodeConfigSchema = z.object({
  similarityThreshold: z.number().min(0).max(1).default(0.85),
  maxEntries: z.number().int().positive().default(10000),
  ttlSeconds: z.number().int().nonnegative().default(3600),
  evictPolicy: z.enum(['lru', 'lfu', 'fifo']).default('lru'),
});

export const RagNodeConfigSchema = z.object({
  collectionName: z.string().min(1, 'Nome da colecao eh obrigatorio'),
  topK: z.number().int().positive().max(100).default(5),
  minScore: z.number().min(0).max(1).default(0.7),
  searchMode: z.enum(['dense', 'sparse', 'hybrid']).default('hybrid'),
  rerank: z.boolean().default(true),
  rerankTopN: z.number().int().positive().optional(),
});

export const PromptNodeConfigSchema = z.object({
  template: z.string().min(1, 'Template do prompt nao pode ser vazio'),
  variables: z.array(z.string()).default([]),
});

export const EvalNodeConfigSchema = z.object({
  metrics: z.array(z.enum(['relevance', 'latency', 'accuracy', 'cost'])).min(1),
  minPassScore: z.number().min(0).max(1).default(0.8),
  alertOnFailure: z.boolean().default(true),
});

export const StudioNodeSchema = z.object({
  id: z.string().min(1, 'ID do nó eh obrigatorio'),
  type: NodeTypeSchema,
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  state: NodeExecutionStateSchema.default('idle'),
  data: z.record(z.unknown()).default({}),
  error: z.string().optional(),
  lastExecutionDurationMs: z.number().nonnegative().optional(),
});

export const StudioEdgeSchema = z.object({
  id: z.string().min(1, 'ID da aresta eh obrigatorio'),
  source: z.string().min(1, 'No de origem eh obrigatorio'),
  sourceHandle: z.string().optional(),
  target: z.string().min(1, 'No de destino eh obrigatorio'),
  targetHandle: z.string().optional(),
  animated: z.boolean().optional(),
});

export const PipelineGraphSchema = z.object({
  name: z.string().min(1, 'Nome do pipeline eh obrigatorio'),
  version: z.string().default('1.0.0'),
  nodes: z.array(StudioNodeSchema).min(1, 'O pipeline deve conter ao menos um nó'),
  edges: z.array(StudioEdgeSchema).default([]),
});

export type PipelineGraph = z.infer<typeof PipelineGraphSchema>;

export function validatePipeline(input: unknown): {
  success: boolean;
  data?: PipelineGraph;
  errors?: string[];
} {
  const result = PipelineGraphSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors = result.error.issues.map(
    (issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`
  );
  return { success: false, errors };
}
