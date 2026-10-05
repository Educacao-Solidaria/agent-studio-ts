import test from 'node:test';
import assert from 'node:assert/strict';
import { MockMcpTransport, type McpJsonRpcResponse } from '../src/mcp/transport.ts';

test('MockMcpTransport: conecta e desconecta alterando estado', async () => {
  const transport = new MockMcpTransport();
  assert.equal(transport.isConnected, false);

  await transport.connect('http://localhost:8000/sse');
  assert.equal(transport.isConnected, true);

  await transport.disconnect();
  assert.equal(transport.isConnected, false);
});

test('MockMcpTransport: lida com requisicao registrada e responde via mensagem', async () => {
  const transport = new MockMcpTransport();
  await transport.connect('mock://local');

  transport.registerMethod('tools/list', () => {
    return {
      tools: [
        { name: 'hybrid_search', description: 'Busca hibrida dense + sparse' },
        { name: 'cache_get', description: 'Consulta cache semantico' },
      ],
    };
  });

  const responses: McpJsonRpcResponse[] = [];
  transport.onMessage((data) => {
    responses.push(data as McpJsonRpcResponse);
  });

  await transport.send({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
    params: {},
  });

  assert.equal(responses.length, 1);
  assert.equal(responses[0].id, 1);
  const result = responses[0].result as { tools: Array<{ name: string }> };
  assert.equal(result.tools.length, 2);
  assert.equal(result.tools[0].name, 'hybrid_search');
});

test('MockMcpTransport: retorna erro -32601 para metodo nao registrado', async () => {
  const transport = new MockMcpTransport();
  await transport.connect('mock://local');

  const responses: McpJsonRpcResponse[] = [];
  transport.onMessage((data) => {
    responses.push(data as McpJsonRpcResponse);
  });

  await transport.send({
    jsonrpc: '2.0',
    id: 99,
    method: 'metodo_inexistente',
  });

  assert.equal(responses.length, 1);
  assert.equal(responses[0].error?.code, -32601);
  assert.match(responses[0].error?.message || '', /Metodo nao encontrado/);
});

test('MockMcpTransport: dispara erro ao tentar enviar com transporte desconectado', async () => {
  const transport = new MockMcpTransport();
  let caughtError: Error | null = null;
  transport.onError((err) => {
    caughtError = err;
  });

  await assert.rejects(async () => {
    await transport.send({ jsonrpc: '2.0', id: 1, method: 'ping' });
  }, /Transporte desconectado/);

  assert.ok(caughtError);
  assert.match(caughtError.message, /Transporte desconectado/);
});
