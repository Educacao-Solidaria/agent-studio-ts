import type { McpTransport } from './client.ts';

export interface McpJsonRpcRequest<TParams = Record<string, unknown>> {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: TParams;
}

export interface McpJsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface McpJsonRpcResponse<TResult = unknown> {
  jsonrpc: '2.0';
  id: string | number;
  result?: TResult;
  error?: McpJsonRpcError;
}

export interface McpJsonRpcNotification<TParams = Record<string, unknown>> {
  jsonrpc: '2.0';
  method: string;
  params?: TParams;
}

export type RequestHandler = (params?: Record<string, unknown>) => Promise<unknown> | unknown;

export class MockMcpTransport implements McpTransport {
  public isConnected: boolean = false;
  private messageHandlers: Array<(data: unknown) => void> = [];
  private errorHandlers: Array<(err: Error) => void> = [];
  private methodHandlers: Map<string, RequestHandler> = new Map();

  public async connect(_url: string): Promise<void> {
    this.isConnected = true;
  }

  public async disconnect(): Promise<void> {
    this.isConnected = false;
  }

  public registerMethod(method: string, handler: RequestHandler): void {
    this.methodHandlers.set(method, handler);
  }

  public onMessage(handler: (data: unknown) => void): void {
    this.messageHandlers.push(handler);
  }

  public onError(handler: (err: Error) => void): void {
    this.errorHandlers.push(handler);
  }

  public async send(message: unknown): Promise<void> {
    if (!this.isConnected) {
      const err = new Error('Transporte desconectado. Impossivel enviar mensagem.');
      this.errorHandlers.forEach(h => h(err));
      throw err;
    }

    const req = message as McpJsonRpcRequest;
    if (!req || req.jsonrpc !== '2.0' || !req.method) {
      const err = new Error('Payload JSON-RPC 2.0 invalido.');
      this.errorHandlers.forEach(h => h(err));
      throw err;
    }

    const handler = this.methodHandlers.get(req.method);
    if (!handler) {
      const response: McpJsonRpcResponse = {
        jsonrpc: '2.0',
        id: req.id,
        error: {
          code: -32601,
          message: `Metodo nao encontrado: ${req.method}`,
        },
      };
      this.emitMessage(response);
      return;
    }

    try {
      const result = await handler(req.params);
      const response: McpJsonRpcResponse = {
        jsonrpc: '2.0',
        id: req.id,
        result,
      };
      this.emitMessage(response);
    } catch (err: unknown) {
      const response: McpJsonRpcResponse = {
        jsonrpc: '2.0',
        id: req.id,
        error: {
          code: -32000,
          message: err instanceof Error ? err.message : String(err),
        },
      };
      this.emitMessage(response);
    }
  }

  public emitNotification(method: string, params?: Record<string, unknown>): void {
    const notif: McpJsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };
    this.emitMessage(notif);
  }

  private emitMessage(data: unknown): void {
    for (const handler of this.messageHandlers) {
      handler(data);
    }
  }
}
