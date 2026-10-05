/**
 * Configurações especializadas para os nós do ecossistema Agent Studio.
 */

export interface GatewayNodeConfig {
  model: string;
  temperature: number;
  topP?: number;
  fallbackModels: string[];
  stream: boolean;
  systemPrompt?: string;
  timeoutMs: number;
}

export interface CacheNodeConfig {
  similarityThreshold: number;
  maxEntries: number;
  ttlSeconds: number;
  evictPolicy: 'lru' | 'lfu' | 'fifo';
}

export interface RagNodeConfig {
  collectionName: string;
  topK: number;
  minScore: number;
  searchMode: 'dense' | 'sparse' | 'hybrid';
  rerank: boolean;
  rerankTopN?: number;
}

export interface PromptNodeConfig {
  template: string;
  variables: string[];
}

export interface EvalNodeConfig {
  metrics: Array<'relevance' | 'latency' | 'accuracy' | 'cost'>;
  minPassScore: number;
  alertOnFailure: boolean;
}
