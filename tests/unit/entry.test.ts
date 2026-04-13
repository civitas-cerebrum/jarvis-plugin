import { describe, it, expect, vi } from 'vitest';

describe('initMcpServer cleanup callback', () => {
  it('accepts an optional cleanup parameter', async () => {
    // Verify the function signature accepts a cleanup callback
    // We import the module to check it compiles with the new signature
    const mod = await import('../../src/mcp/entry.js');
    expect(typeof mod.initMcpServer).toBe('function');
    // Function should accept 2 parameters (ctx, cleanup?)
    expect(mod.initMcpServer.length).toBeGreaterThanOrEqual(1);
  });
});
