import sherpa from 'sherpa-onnx-node';
import type { Logger, ScopedLogger } from '../logging/logger.js';

export interface SttModelConfig {
  encoder: string;
  decoder: string;
  tokens: string;
}

export interface SttOptions {
  modelConfig: SttModelConfig;
  logger: Logger;
  numThreads?: number;
}

export interface SttResult {
  text: string;
  confidence: number;
  durationMs: number;
}

export interface SttEngine {
  transcribeSegment(samples: Float32Array, sampleRate: number): Promise<SttResult>;
  destroy(): void;
}

export function createSttEngine(options: SttOptions): SttEngine {
  const log: ScopedLogger = options.logger.scope('pipeline:stt');
  const numThreads = options.numThreads ?? 1;

  log.info('Creating STT engine', {
    encoder: options.modelConfig.encoder,
    decoder: options.modelConfig.decoder,
    tokens: options.modelConfig.tokens,
    numThreads,
  });

  const recognizer = new sherpa.OfflineRecognizer({
    modelConfig: {
      whisper: {
        encoder: options.modelConfig.encoder,
        decoder: options.modelConfig.decoder,
      },
      tokens: options.modelConfig.tokens,
      numThreads,
    },
  });

  log.info('STT recognizer created');

  return {
    async transcribeSegment(samples: Float32Array, sampleRate: number): Promise<SttResult> {
      const start = Date.now();
      log.debug('Transcribing segment', {
        sampleCount: samples.length,
        sampleRate,
      });

      const stream = recognizer.createStream();
      stream.acceptWaveform({ sampleRate, samples });
      recognizer.decode(stream);

      const result = recognizer.getResult(stream);
      const text = (typeof result === 'string' ? result : result?.text ?? '').trim();
      const confidence = text.length > 0 ? 0.8 : 0;
      const durationMs = Date.now() - start;

      log.debug('Transcription complete', { text, confidence, durationMs });

      return { text, confidence, durationMs };
    },

    destroy(): void {
      log.info('STT engine destroyed');
    },
  };
}
