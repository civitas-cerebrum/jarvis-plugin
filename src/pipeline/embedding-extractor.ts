import sherpa from 'sherpa-onnx-node';
import type { Logger, ScopedLogger } from '../logging/logger.js';

export interface EmbeddingExtractorOptions {
  modelPath: string;
  logger: Logger;
  numThreads?: number;
}

export interface EmbeddingExtractor {
  extract(samples: Float32Array, sampleRate: number): Float32Array;
  dim(): number;
  destroy(): void;
}

export function createEmbeddingExtractor(
  options: EmbeddingExtractorOptions,
): EmbeddingExtractor {
  const { modelPath, logger, numThreads = 1 } = options;
  const log: ScopedLogger = logger.scope('pipeline:embedding');

  log.info('Creating speaker embedding extractor', { modelPath, numThreads });

  const extractor = new sherpa.SpeakerEmbeddingExtractor({
    model: modelPath,
    numThreads,
    debug: false,
  });

  log.info('Speaker embedding extractor created', { dim: extractor.dim });

  return {
    extract(samples: Float32Array, sampleRate: number): Float32Array {
      const start = performance.now();
      log.debug('Extracting embedding', {
        sampleCount: samples.length,
        sampleRate,
      });

      const stream = extractor.createStream();
      stream.acceptWaveform({ sampleRate, samples });
      const embedding = extractor.compute(stream);

      const elapsed = performance.now() - start;
      log.debug('Embedding extracted', {
        dim: embedding.length,
        elapsedMs: Math.round(elapsed),
      });

      return embedding;
    },

    dim(): number {
      return extractor.dim;
    },

    destroy(): void {
      log.info('Destroying speaker embedding extractor');
      if (extractor.free) {
        extractor.free();
      }
      log.info('Speaker embedding extractor destroyed');
    },
  };
}
