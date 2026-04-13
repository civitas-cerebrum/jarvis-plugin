import { createOrchestrator } from './pipeline/orchestrator.js';
import { initMcpServer } from './mcp/entry.js';

const dataDir = process.env.JARVIS_DATA || process.env.CLAUDE_PLUGIN_DATA || './data';

async function main(): Promise<void> {
  process.stderr.write(`[jarvis] Starting with dataDir: ${dataDir}\n`);
  const orchestrator = createOrchestrator({ dataDir });
  initMcpServer(orchestrator);

  try {
    await orchestrator.start();
  } catch (err: unknown) {
    process.stderr.write(
      `[jarvis] Pipeline start failed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    // MCP server stays up so tools like downloadModels and getStatus still work
  }

  process.stderr.write('[jarvis] MCP server ready\n');

  process.on('SIGTERM', () => { orchestrator.destroy(); process.exit(0); });
  process.on('SIGINT', () => { orchestrator.destroy(); process.exit(0); });
}

process.on('uncaughtException', (err) => {
  process.stderr.write(`[jarvis] Uncaught exception: ${err.message}\n${err.stack}\n`);
  // EPIPE from child process stdin is non-fatal — the stream error handler
  // will clean up. Only exit on truly unrecoverable errors.
  if ('code' in err && (err as NodeJS.ErrnoException).code === 'EPIPE') {
    process.stderr.write('[jarvis] EPIPE is non-fatal, continuing\n');
    return;
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  process.stderr.write(
    `[jarvis] Unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}\n`,
  );
});

main().catch((err) => {
  process.stderr.write(`[jarvis] Fatal error: ${err}\n`);
  process.exit(1);
});
