import type { Logger, ScopedLogger } from '../logging/logger.js';
import * as sherpa from 'sherpa-onnx';

export interface SttModelConfig {
  encoder: string;
  decoder: string;
  joiner: string;
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
    joiner: options.modelConfig.joiner,
    tokens: options.modelConfig.tokens,
    numThreads,
  });

  const recognizer = sherpa.createOnlineRecognizer({
    transducer: {
      encoder: options.modelConfig.encoder,
      decoder: options.modelConfig.decoder,
      joiner: options.modelConfig.joiner,
    },
    tokens: options.modelConfig.tokens,
    numThreads,
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
      stream.acceptWaveform(sampleRate, samples);
      recognizer.decode(stream);

      const result = recognizer.getResult(stream);
      const text = (result.text ?? '').trim();
      const confidence = text.length > 0 ? 0.8 : 0;
      const durationMs = Date.now() - start;

      log.debug('Transcription complete', { text, confidence, durationMs });

      stream.free();

      return { text, confidence, durationMs };
    },

    destroy(): void {
      log.info('Destroying STT engine');
      recognizer.free();
      log.info('STT engine destroyed');
    },
  };
}
