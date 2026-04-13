import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockStream = {
  acceptWaveform: vi.fn(),
  free: vi.fn(),
};

const mockRecognizer = {
  createStream: vi.fn(() => mockStream),
  decode: vi.fn(),
  getResult: vi.fn(() => ({ text: 'hello world' })),
  free: vi.fn(),
};

vi.mock('sherpa-onnx-node', () => ({
  OnlineRecognizer: vi.fn(() => mockRecognizer),
}));

import { createSttEngine } from '../../src/pipeline/stt.js';
import type { SttOptions } from '../../src/pipeline/stt.js';
import { createLogger, LogLevel } from '../../src/logging/logger.js';

describe('SttEngine', () => {
  let options: SttOptions;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRecognizer.getResult.mockReturnValue({ text: 'hello world' });

    options = {
      modelConfig: {
        encoder: 'encoder.onnx',
        decoder: 'decoder.onnx',
        joiner: 'joiner.onnx',
        tokens: 'tokens.txt',
      },
      logger: createLogger({ level: LogLevel.DEBUG, ringBufferSize: 100 }),
      numThreads: 2,
    };
  });

  it('creates an engine via sherpa-onnx', () => {
    const engine = createSttEngine(options);
    expect(engine).toBeDefined();
    expect(engine.transcribeSegment).toBeInstanceOf(Function);
    expect(engine.destroy).toBeInstanceOf(Function);
  });

  it('transcribeSegment feeds audio and returns text', async () => {
    const engine = createSttEngine(options);
    const samples = new Float32Array([0.1, 0.2, 0.3]);
    const sampleRate = 16000;

    const result = await engine.transcribeSegment(samples, sampleRate);

    expect(mockRecognizer.createStream).toHaveBeenCalled();
    expect(mockStream.acceptWaveform).toHaveBeenCalledWith(sampleRate, samples);
    expect(mockRecognizer.decode).toHaveBeenCalledWith(mockStream);
    expect(mockRecognizer.getResult).toHaveBeenCalledWith(mockStream);
    expect(mockStream.free).toHaveBeenCalled();

    expect(result.text).toBe('hello world');
    expect(result.confidence).toBe(0.8);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('destroy frees native resources', () => {
    const engine = createSttEngine(options);
    engine.destroy();

    expect(mockRecognizer.free).toHaveBeenCalled();
  });
});
