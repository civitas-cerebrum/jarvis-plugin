import sherpa from 'sherpa-onnx-node';
import type { Logger, ScopedLogger } from '../logging/logger.js';

export interface TtsOptions {
  modelPath: string;
  voicesPath: string;
  tokensPath: string;
  logger: Logger;
  numThreads?: number;
  speakerId?: number;
  speed?: number;
  /** Use Kokoro engine instead of Piper VITS */
  kokoro?: boolean;
  /** espeak-ng-data directory (used by Kokoro) */
  dataDir?: string;
}

export interface TtsResult {
  samples: Float32Array;
  sampleRate: number;
}

export interface TtsEngine {
  synthesize(text: string): TtsResult;
  destroy(): void;
}

export function createTtsEngine(options: TtsOptions): TtsEngine {
  const log: ScopedLogger = options.logger.scope('pipeline:tts');
  const speakerId = options.speakerId ?? 0;
  const speed = options.speed ?? 1.0;

  log.info('Initializing TTS engine', {
    modelPath: options.modelPath,
    voicesPath: options.voicesPath,
    tokensPath: options.tokensPath,
    numThreads: options.numThreads ?? 1,
    speakerId,
    speed,
  });

  const initStart = performance.now();

  const modelConfig = options.kokoro
    ? {
        kokoro: {
          model: options.modelPath,
          voices: options.voicesPath,
          tokens: options.tokensPath,
          ...(options.dataDir ? { dataDir: options.dataDir } : {}),
        },
      }
    : { vits: { model: options.modelPath, tokens: options.tokensPath, dataDir: options.voicesPath } };

  const tts = new sherpa.OfflineTts({
    model: modelConfig,
    numThreads: options.numThreads ?? 2,
  });

  const initMs = (performance.now() - initStart).toFixed(1);
  log.info(`TTS engine initialized in ${initMs}ms`);

  return {
    synthesize(text: string): TtsResult {
      log.debug('Synthesizing text', { textLength: text.length, speakerId, speed });

      const synthStart = performance.now();

      const result = tts.generate({ text, sid: speakerId, speed });

      const synthMs = (performance.now() - synthStart).toFixed(1);
      log.info(`Synthesized ${result.samples.length} samples in ${synthMs}ms`, {
        sampleRate: result.sampleRate,
        durationSec: +(result.samples.length / result.sampleRate).toFixed(3),
      });

      return {
        samples: result.samples,
        sampleRate: result.sampleRate,
      };
    },

    destroy(): void {
      log.info('TTS engine destroyed');
    },
  };
}
