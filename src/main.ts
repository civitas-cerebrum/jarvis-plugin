import { createOrchestrator } from './pipeline/orchestrator.js';
import { initMcpServer } from './mcp/entry.js';

const dataDir = process.env.JARVIS_DATA || process.env.CLAUDE_PLUGIN_DATA || './data';

async function main(): Promise<void> {
  process.stderr.write(`[jarvis] Starting with dataDir: ${dataDir}\n`);
  const orchestrator = createOrchestrator({ dataDir });
  initMcpServer(orchestrator);
  await orchestrator.start();
  process.stderr.write('[jarvis] MCP server ready\n');

  process.on('SIGTERM', () => { orchestrator.destroy(); process.exit(0); });
  process.on('SIGINT', () => { orchestrator.destroy(); process.exit(0); });
}

main().catch((err) => {
  process.stderr.write(`[jarvis] Fatal error: ${err}\n`);
  process.exit(1);
});
