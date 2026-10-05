import { z } from 'zod';
import type { StudioEdge, StudioNode } from '../types/domain.ts';

export const PipelineExportSchema = z.object({
  version: z.literal('1.0.0'),
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  viewport: z.object({
    x: z.number(),
    y: z.number(),
    zoom: z.number().positive(),
  }),
  nodes: z.array(
    z.object({
      id: z.string().min(1),
      type: z.enum(['gateway', 'cache', 'rag', 'prompt', 'eval', 'custom']),
      position: z.object({ x: z.number(), y: z.number() }),
      state: z.enum(['idle', 'queued', 'running', 'success', 'error']),
      data: z.record(z.string(), z.unknown()),
      error: z.string().optional(),
      lastExecutionDurationMs: z.number().nonnegative().optional(),
    })
  ),
  edges: z.array(
    z.object({
      id: z.string().min(1),
      source: z.string().min(1),
      sourceHandle: z.string().optional(),
      target: z.string().min(1),
      targetHandle: z.string().optional(),
      animated: z.boolean().optional(),
    })
  ),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type PipelineExport = z.infer<typeof PipelineExportSchema>;

export class SerializationError extends Error {
  readonly details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = 'SerializationError';
    this.details = details;
  }
}

/**
 * Serializa o estado reativo do grafo em uma string JSON padronizada e portável.
 */
export function serializePipeline(params: {
  id?: string;
  name: string;
  description?: string;
  nodes: StudioNode[];
  edges: StudioEdge[];
  viewport?: { x: number; y: number; zoom: number };
  metadata?: Record<string, unknown>;
}): string {
  const now = new Date().toISOString();
  const payload: PipelineExport = {
    version: '1.0.0',
    id: params.id || `pipeline-${Date.now()}`,
    name: params.name,
    description: params.description,
    createdAt: now,
    updatedAt: now,
    viewport: params.viewport || { x: 0, y: 0, zoom: 1 },
    nodes: params.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: { ...node.position },
      state: 'idle', // Reseta estado de execução ao exportar
      data: { ...node.data },
      error: undefined,
      lastExecutionDurationMs: undefined,
    })),
    edges: params.edges.map((edge) => ({ ...edge })),
    metadata: params.metadata,
  };

  const validated = PipelineExportSchema.parse(payload);
  return JSON.stringify(validated, null, 2);
}

/**
 * Desserializa e valida a integridade relacional do grafo a partir de string JSON.
 */
export function deserializePipeline(jsonString: string): PipelineExport {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonString);
  } catch (err) {
    throw new SerializationError('JSON malformatado ou inválido.', err);
  }

  const result = PipelineExportSchema.safeParse(raw);
  if (!result.success) {
    throw new SerializationError('Estrutura de pipeline incompatível com a versão 1.0.0.', result.error);
  }

  const pipeline = result.data;
  const nodeIds = new Set(pipeline.nodes.map((n) => n.id));

  // Validação de integridade referencial das arestas
  for (const edge of pipeline.edges) {
    if (!nodeIds.has(edge.source)) {
      throw new SerializationError(
        `Aresta '${edge.id}' referencia nó de origem inexistente: '${edge.source}'`
      );
    }
    if (!nodeIds.has(edge.target)) {
      throw new SerializationError(
        `Aresta '${edge.id}' referencia nó de destino inexistente: '${edge.target}'`
      );
    }
  }

  return pipeline;
}

/**
 * Cria uma cópia profunda do pipeline gerando novos identificadores de nós e arestas.
 */
export function clonePipeline(pipeline: PipelineExport): PipelineExport {
  const idMap = new Map<string, string>();
  const clonedNodes = pipeline.nodes.map((node) => {
    const newId = `node-${Math.random().toString(36).slice(2, 9)}`;
    idMap.set(node.id, newId);
    return {
      ...node,
      id: newId,
      position: { x: node.position.x + 40, y: node.position.y + 40 },
      data: { ...node.data },
    };
  });

  const clonedEdges = pipeline.edges.map((edge) => ({
    ...edge,
    id: `edge-${Math.random().toString(36).slice(2, 9)}`,
    source: idMap.get(edge.source) || edge.source,
    target: idMap.get(edge.target) || edge.target,
  }));

  const now = new Date().toISOString();
  return {
    ...pipeline,
    id: `pipeline-${Date.now()}`,
    name: `${pipeline.name} (Cópia)`,
    createdAt: now,
    updatedAt: now,
    nodes: clonedNodes,
    edges: clonedEdges,
  };
}
