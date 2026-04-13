import { createInterface } from 'node:readline';
import { createToolHandlers, TOOL_DEFINITIONS } from './tools.js';
import type { ToolContext } from './tools.js';
import type { ToolHandlers } from './tools.js';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

function send(msg: JsonRpcResponse): void {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

export function initMcpServer(ctx: ToolContext): void {
  const handlers: ToolHandlers = createToolHandlers(ctx);

  const rl = createInterface({ input: process.stdin, terminal: false });

  rl.on('line', (line: string) => {
    void handleLine(line, handlers);
  });
}

async function handleLine(
  line: string,
  handlers: ToolHandlers,
): Promise<void> {
  let parsed: JsonRpcRequest;
  try {
    parsed = JSON.parse(line) as JsonRpcRequest;
  } catch {
    send({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error' },
    });
    return;
  }

  const { id, method, params } = parsed;

  // Notifications (no id) — don't send a response
  if (method === 'notifications/initialized') {
    return;
  }

  if (method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: id ?? null,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'jarvis-voice', version: '0.1.0' },
      },
    });
    return;
  }

  if (method === 'tools/list') {
    send({
      jsonrpc: '2.0',
      id: id ?? null,
      result: { tools: TOOL_DEFINITIONS },
    });
    return;
  }

  if (method === 'tools/call') {
    const toolName = (params?.name as string) ?? '';
    const toolArgs = (params?.arguments as Record<string, unknown>) ?? {};
    const handler = handlers[toolName];

    if (!handler) {
      send({
        jsonrpc: '2.0',
        id: id ?? null,
        result: {
          content: [{ type: 'text', text: `Error: unknown tool "${toolName}"` }],
          isError: true,
        },
      });
      return;
    }

    try {
      const result = await handler(toolArgs);
      send({
        jsonrpc: '2.0',
        id: id ?? null,
        result: {
          content: [{ type: 'text', text: JSON.stringify(result) }],
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      send({
        jsonrpc: '2.0',
        id: id ?? null,
        result: {
          content: [{ type: 'text', text: `Error: ${message}` }],
          isError: true,
        },
      });
    }
    return;
  }

  // Unknown method
  send({
    jsonrpc: '2.0',
    id: id ?? null,
    error: { code: -32601, message: `Method not found: ${method}` },
  });
}
