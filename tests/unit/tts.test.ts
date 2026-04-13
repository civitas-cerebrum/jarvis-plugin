import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGenerate = vi.fn();
const mockFree = vi.fn();

vi.mock('sherpa-onnx-node', () => ({
  OfflineTts: vi.fn(() => ({
    generate: mockGenerate,
    free: mockFree,
  })),
}));

import { createTtsEngine } from '../../src/pipeline/tts.js';
import { createLogger, LogLevel } from '../../src/logging/logger.js';
import type { TtsOptions } from '../../src/pipeline/tts.js';

function makeOptions(overrides?: Partial<TtsOptions>): TtsOptions {
  return {
    modelPath: '/models/tts.onnx',
    voicesPath: '/models/voices',
    tokensPath: '/models/tokens.txt',
    logger: createLogger({ level: LogLevel.DEBUG, ringBufferSize: 100 }),
    ...overrides,
  };
}

describe('createTtsEngine', () => {
  beforeEach(() => {
    mockGenerate.mockReset();
    mockFree.mockReset();
  });

  it('creates a TTS engine', () => {
    const engine = createTtsEngine(makeOptions());
    expect(engine).toBeDefined();
    expect(typeof engine.synthesize).toBe('function');
    expect(typeof engine.destroy).toBe('function');
  });

  it('synthesizes text to audio samples', () => {
    const expectedSamples = new Float32Array([0.1, 0.2, 0.3]);
    mockGenerate.mockReturnValue({ samples: expectedSamples, sampleRate: 24000 });

    const engine = createTtsEngine(makeOptions({ speakerId: 2, speed: 1.5 }));
    const result = engine.synthesize('Hello world');

    expect(mockGenerate).toHaveBeenCalledWith({ text: 'Hello world', sid: 2, speed: 1.5 });
    expect(result.samples).toBe(expectedSamples);
    expect(result.sampleRate).toBe(24000);
  });

  it('uses default speakerId and speed when not specified', () => {
    mockGenerate.mockReturnValue({ samples: new Float32Array([0.1]), sampleRate: 24000 });

    const engine = createTtsEngine(makeOptions());
    engine.synthesize('Test');

    expect(mockGenerate).toHaveBeenCalledWith({ text: 'Test', sid: 0, speed: 1.0 });
  });

  it('destroy frees native resources', () => {
    const engine = createTtsEngine(makeOptions());
    engine.destroy();

    expect(mockFree).toHaveBeenCalledOnce();
  });
});
