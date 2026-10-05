/**
 * Contrato de uma ferramenta descoberta via protocolo MCP.
 */
export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * Contrato de um recurso descoberto via protocolo MCP.
 */
export interface McpResourceDefinition {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

/**
 * Contrato de um prompt descoberto via protocolo MCP.
 */
export interface McpPromptDefinition {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required: boolean;
  }>;
}

/**
 * Interface abstrata do transporte de conexão MCP (SSE, WebSocket ou Mock).
 */
export interface McpTransport {
  connect(url: string): Promise<void>;
  disconnect(): Promise<void>;
  send(message: unknown): Promise<void>;
  onMessage(handler: (data: unknown) => void): void;
  onError(handler: (err: Error) => void): void;
}

/**
 * Contrato do MCP Client Host para o frontend.
 */
export interface McpClientHost {
  isConnected: boolean;
  connect(endpoint: string): Promise<void>;
  disconnect(): Promise<void>;
  listTools(): Promise<McpToolDefinition[]>;
  callTool<TResult = unknown>(
    name: string,
    args: Record<string, unknown>
  ): Promise<TResult>;
  listResources(): Promise<McpResourceDefinition[]>;
  listPrompts(): Promise<McpPromptDefinition[]>;
}
