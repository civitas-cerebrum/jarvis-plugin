import { Vad } from 'sherpa-onnx-node';
import type { ScopedLogger } from '../logging/logger.js';

export interface VadOptions {
  modelPath: string;
  threshold: number;
  logger: ScopedLogger;
  sampleRate?: number;
  minSilenceDuration?: number;
  minSpeechDuration?: number;
  onSpeechSegment?: (samples: Float32Array) => void;
  /** @internal Allows injecting a mock Vad instance for testing. */
  _vadInstance?: Vad;
}

export interface VadPipeline {
  feedAudio(samples: Float32Array): void;
  isActive(): boolean;
  setThreshold(value: number): void;
  destroy(): void;
}

export function createVadPipeline(options: VadOptions): VadPipeline {
  const {
    modelPath,
    threshold,
    logger,
    sampleRate = 16000,
    minSilenceDuration = 0.5,
    minSpeechDuration = 0.25,
    onSpeechSegment,
    _vadInstance,
  } = options;

  logger.info('Creating VAD pipeline', {
    modelPath,
    threshold,
    sampleRate,
    minSilenceDuration,
    minSpeechDuration,
  });

  const vad: Vad = _vadInstance ?? new Vad({
    sileroVad: {
      model: modelPath,
      threshold,
      minSilenceDuration,
      minSpeechDuration,
    },
    sampleRate,
    debug: false,
  });

  let active = false;

  logger.info('VAD pipeline created');

  function feedAudio(samples: Float32Array): void {
    const start = performance.now();

    vad.acceptWaveform(samples);

    active = vad.isDetected();

    while (!vad.isEmpty()) {
      const segment = vad.front();
      logger.debug('Speech segment detected', {
        samples: segment.samples.length,
        start: segment.start,
      });
      if (onSpeechSegment) {
        onSpeechSegment(segment.samples);
      }
      vad.pop();
    }

    const elapsed = performance.now() - start;
    if (elapsed > 50) {
      logger.warn('feedAudio took too long', { elapsedMs: Math.round(elapsed) });
    }
  }

  function isActive(): boolean {
    return active;
  }

  function setThreshold(value: number): void {
    logger.warn('Runtime threshold change requires VAD restart', {
      requested: value,
    });
  }

  function destroy(): void {
    logger.info('Destroying VAD pipeline');
    vad.free();
    logger.info('VAD pipeline destroyed');
  }

  return { feedAudio, isActive, setThreshold, destroy };
}
