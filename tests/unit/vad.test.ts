import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createVadPipeline } from '../../src/pipeline/vad.js';
import { createLogger, LogLevel } from '../../src/logging/logger.js';

const mockVad = {
  acceptWaveform: vi.fn(),
  isEmpty: vi.fn().mockReturnValue(true),
  isDetected: vi.fn().mockReturnValue(false),
  front: vi.fn(),
  pop: vi.fn(),
  reset: vi.fn(),
  flush: vi.fn(),
  free: vi.fn(),
};

function makeLogger() {
  return createLogger({ level: LogLevel.DEBUG, ringBufferSize: 100 }).scope('vad-test');
}

describe('VadPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVad.isEmpty.mockReturnValue(true);
    mockVad.isDetected.mockReturnValue(false);
  });

  it('creates a VAD pipeline with injected instance', () => {
    const pipeline = createVadPipeline({
      modelPath: '/models/silero_vad.onnx',
      threshold: 0.5,
      logger: makeLogger(),
      sampleRate: 16000,
      minSilenceDuration: 0.5,
      minSpeechDuration: 0.25,
      _vadInstance: mockVad as any,
    });

    expect(pipeline.feedAudio).toBeTypeOf('function');
    expect(pipeline.isActive).toBeTypeOf('function');
    expect(pipeline.setThreshold).toBeTypeOf('function');
    expect(pipeline.destroy).toBeTypeOf('function');
  });

  it('processes audio and emits speech segments', () => {
    const segmentSamples = new Float32Array([0.1, 0.2, 0.3]);
    const onSpeechSegment = vi.fn();

    let isEmptyCallCount = 0;
    mockVad.isEmpty.mockImplementation(() => {
      isEmptyCallCount++;
      // First call returns false (segment available), second returns true (drained)
      return isEmptyCallCount > 1;
    });
    mockVad.isDetected.mockReturnValue(true);
    mockVad.front.mockReturnValue({ samples: segmentSamples, start: 0 });

    const pipeline = createVadPipeline({
      modelPath: '/models/silero_vad.onnx',
      threshold: 0.5,
      logger: makeLogger(),
      onSpeechSegment,
      _vadInstance: mockVad as any,
    });

    // Reset call count after creation
    isEmptyCallCount = 0;

    const audio = new Float32Array(480);
    pipeline.feedAudio(audio);

    expect(mockVad.acceptWaveform).toHaveBeenCalledWith(audio);
    expect(pipeline.isActive()).toBe(true);
    expect(onSpeechSegment).toHaveBeenCalledOnce();
    expect(onSpeechSegment).toHaveBeenCalledWith(segmentSamples);
    expect(mockVad.pop).toHaveBeenCalledOnce();
  });

  it('destroy frees native resources', () => {
    const pipeline = createVadPipeline({
      modelPath: '/models/silero_vad.onnx',
      threshold: 0.5,
      logger: makeLogger(),
      _vadInstance: mockVad as any,
    });

    pipeline.destroy();

    expect(mockVad.free).toHaveBeenCalledOnce();
  });
});
