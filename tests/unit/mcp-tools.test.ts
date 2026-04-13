import { describe, it, expect, vi } from 'vitest';
import { TOOL_DEFINITIONS, createToolHandlers } from '../../src/mcp/tools.js';
import type { ToolContext } from '../../src/mcp/tools.js';

function createMockContext(): ToolContext {
  return {
    getStatus: vi.fn().mockReturnValue({ mode: 'vad', pipelineReady: true }),
    listenForResponse: vi.fn().mockResolvedValue({ heard: true, text: 'hello' }),
    speakText: vi.fn().mockResolvedValue({ spoken: true }),
    startEnrollment: vi.fn().mockResolvedValue({ sessionId: 'abc' }),
    testEnrollment: vi.fn().mockResolvedValue({ verified: true }),
    saveProfile: vi.fn().mockResolvedValue({ saved: true }),
    resetProfile: vi.fn().mockResolvedValue({ reset: true }),
    setMode: vi.fn().mockResolvedValue({ mode: 'vad' }),
    setThreshold: vi.fn().mockResolvedValue({ parameter: 'vad_sensitivity', value: 0.6 }),
    downloadModels: vi.fn().mockResolvedValue({ status: 'all_present' }),
    getDebugLog: vi.fn().mockReturnValue({ entries: [] }),
    getSessionStats: vi.fn().mockReturnValue({ utterancesCaptured: 5 }),
  };
}

describe('TOOL_DEFINITIONS', () => {
  const expectedNames = [
    'ListenForResponse',
    'SpeakText',
    'GetVoiceStatus',
    'StartEnrollment',
    'TestEnrollment',
    'SaveProfile',
    'ResetProfile',
    'SetMode',
    'SetThreshold',
    'DownloadModels',
    'GetDebugLog',
    'GetSessionStats',
  ];

  it('contains all 12 tool names', () => {
    const names = TOOL_DEFINITIONS.map((t) => t.name);
    expect(names).toEqual(expectedNames);
    expect(TOOL_DEFINITIONS).toHaveLength(12);
  });

  it('every tool has name, description, and inputSchema with type object', () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(typeof tool.name).toBe('string');
      expect(tool.name.length).toBeGreaterThan(0);
      expect(typeof tool.description).toBe('string');
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
    }
  });
});

describe('createToolHandlers', () => {
  it('GetVoiceStatus handler returns status from context', async () => {
    const ctx = createMockContext();
    const handlers = createToolHandlers(ctx);
    const result = await handlers.GetVoiceStatus({});
    expect(result).toEqual({ mode: 'vad', pipelineReady: true });
    expect(ctx.getStatus).toHaveBeenCalledOnce();
  });

  it('ListenForResponse handler delegates with correct timeout', async () => {
    const ctx = createMockContext();
    const handlers = createToolHandlers(ctx);
    const result = await handlers.ListenForResponse({ timeout_ms: 5000 });
    expect(result).toEqual({ heard: true, text: 'hello' });
    expect(ctx.listenForResponse).toHaveBeenCalledWith(5000);
  });

  it('ListenForResponse handler uses default timeout when not provided', async () => {
    const ctx = createMockContext();
    const handlers = createToolHandlers(ctx);
    await handlers.ListenForResponse({});
    expect(ctx.listenForResponse).toHaveBeenCalledWith(30_000);
  });

  it('ListenForResponse clamps timeout_ms below 1000 to 1000', async () => {
    const ctx = createMockContext();
    const handlers = createToolHandlers(ctx);
    await handlers.ListenForResponse({ timeout_ms: 100 });
    expect(ctx.listenForResponse).toHaveBeenCalledWith(1_000);
  });

  it('ListenForResponse clamps timeout_ms above 120000 to 120000', async () => {
    const ctx = createMockContext();
    const handlers = createToolHandlers(ctx);
    await handlers.ListenForResponse({ timeout_ms: 999_999 });
    expect(ctx.listenForResponse).toHaveBeenCalledWith(120_000);
  });

  it('SpeakText handler delegates with text', async () => {
    const ctx = createMockContext();
    const handlers = createToolHandlers(ctx);
    const result = await handlers.SpeakText({ text: 'Hello world' });
    expect(result).toEqual({ spoken: true });
    expect(ctx.speakText).toHaveBeenCalledWith('Hello world', false);
  });

  it('SpeakText handler throws when text is missing', async () => {
    const ctx = createMockContext();
    const handlers = createToolHandlers(ctx);
    await expect(handlers.SpeakText({})).rejects.toThrow('Missing required parameter: text');
  });

  it('GetSessionStats returns stats', async () => {
    const ctx = createMockContext();
    const handlers = createToolHandlers(ctx);
    const result = await handlers.GetSessionStats({});
    expect(result).toEqual({ utterancesCaptured: 5 });
    expect(ctx.getSessionStats).toHaveBeenCalledOnce();
  });

  it('SetMode handler delegates with mode', async () => {
    const ctx = createMockContext();
    const handlers = createToolHandlers(ctx);
    await handlers.SetMode({ mode: 'vad' });
    expect(ctx.setMode).toHaveBeenCalledWith('vad');
  });

  it('SetMode handler throws when mode is missing', async () => {
    const ctx = createMockContext();
    const handlers = createToolHandlers(ctx);
    await expect(handlers.SetMode({})).rejects.toThrow('Missing required parameter: mode');
  });

  it('SetThreshold handler delegates with parameter and value', async () => {
    const ctx = createMockContext();
    const handlers = createToolHandlers(ctx);
    await handlers.SetThreshold({ parameter: 'vad_sensitivity', value: 0.6 });
    expect(ctx.setThreshold).toHaveBeenCalledWith('vad_sensitivity', 0.6);
  });

  it('TestEnrollment handler throws when session_id is missing', async () => {
    const ctx = createMockContext();
    const handlers = createToolHandlers(ctx);
    await expect(handlers.TestEnrollment({})).rejects.toThrow(
      'Missing required parameter: session_id',
    );
  });

  it('SaveProfile handler throws when session_id is missing', async () => {
    const ctx = createMockContext();
    const handlers = createToolHandlers(ctx);
    await expect(handlers.SaveProfile({})).rejects.toThrow(
      'Missing required parameter: session_id',
    );
  });

  it('GetDebugLog handler passes filter to context', async () => {
    const ctx = createMockContext();
    const handlers = createToolHandlers(ctx);
    await handlers.GetDebugLog({ count: 10, level: 'WARN' });
    expect(ctx.getDebugLog).toHaveBeenCalledWith({ count: 10, level: 'WARN' });
  });

  it('GetDebugLog handler passes undefined when no filter params', async () => {
    const ctx = createMockContext();
    const handlers = createToolHandlers(ctx);
    await handlers.GetDebugLog({});
    expect(ctx.getDebugLog).toHaveBeenCalledWith(undefined);
  });

  it('DownloadModels handler delegates to context', async () => {
    const ctx = createMockContext();
    const handlers = createToolHandlers(ctx);
    const result = await handlers.DownloadModels({});
    expect(result).toEqual({ status: 'all_present' });
    expect(ctx.downloadModels).toHaveBeenCalledOnce();
  });

  it('ResetProfile handler delegates to context', async () => {
    const ctx = createMockContext();
    const handlers = createToolHandlers(ctx);
    const result = await handlers.ResetProfile({});
    expect(result).toEqual({ reset: true });
    expect(ctx.resetProfile).toHaveBeenCalledOnce();
  });

  it('StartEnrollment handler passes session_id when provided', async () => {
    const ctx = createMockContext();
    const handlers = createToolHandlers(ctx);
    await handlers.StartEnrollment({ session_id: 'test-123' });
    expect(ctx.startEnrollment).toHaveBeenCalledWith('test-123');
  });

  it('StartEnrollment handler passes undefined when no session_id', async () => {
    const ctx = createMockContext();
    const handlers = createToolHandlers(ctx);
    await handlers.StartEnrollment({});
    expect(ctx.startEnrollment).toHaveBeenCalledWith(undefined);
  });
});
