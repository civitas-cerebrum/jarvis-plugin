import { randomUUID } from 'node:crypto';
import type { Logger, ScopedLogger } from '../logging/logger.js';

export const ENROLLMENT_PHRASES: readonly string[] = [
  'The quick brown fox jumps over the lazy dog',
  'She sells seashells by the seashore',
  'How much wood would a woodchuck chuck',
  'Peter Piper picked a peck of pickled peppers',
  'The rain in Spain stays mainly in the plain',
];

export type EnrollmentStatus = 'recording' | 'ready_to_test';

export interface EnrollmentSession {
  readonly id: string;
  status(): EnrollmentStatus;
  phrasesRemaining(): number;
  currentPrompt(): string | null;
  addEmbedding(embedding: Float32Array): void;
  compositeEmbedding(): Float32Array | null;
}

export function createEnrollmentSession(logger: Logger): EnrollmentSession {
  const id = randomUUID();
  const embeddings: Float32Array[] = [];
  const log: ScopedLogger = logger.scope('profile:enrollment');

  log.info('enrollment session created', { id });

  return {
    id,

    status(): EnrollmentStatus {
      return embeddings.length < ENROLLMENT_PHRASES.length
        ? 'recording'
        : 'ready_to_test';
    },

    phrasesRemaining(): number {
      return ENROLLMENT_PHRASES.length - embeddings.length;
    },

    currentPrompt(): string | null {
      if (embeddings.length >= ENROLLMENT_PHRASES.length) {
        return null;
      }
      return ENROLLMENT_PHRASES[embeddings.length];
    },

    addEmbedding(embedding: Float32Array): void {
      const copy = new Float32Array(embedding);
      embeddings.push(copy);
      log.info('embedding added', {
        index: embeddings.length,
        remaining: ENROLLMENT_PHRASES.length - embeddings.length,
      });
    },

    compositeEmbedding(): Float32Array | null {
      if (embeddings.length === 0) {
        return null;
      }

      const dim = embeddings[0].length;
      const avg = new Float32Array(dim);

      for (const emb of embeddings) {
        for (let i = 0; i < dim; i++) {
          avg[i] += emb[i];
        }
      }

      for (let i = 0; i < dim; i++) {
        avg[i] /= embeddings.length;
      }

      return avg;
    },
  };
}
