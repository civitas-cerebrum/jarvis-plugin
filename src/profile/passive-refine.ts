import type { Logger } from '../logging/logger.js';
import { loadProfile, saveProfile } from './storage.js';
import { refineProfile } from '../pipeline/speaker-verify.js';

export interface PassiveRefiner {
  maybeRefine(embedding: Float32Array, confidence: number): void;
}

export function createPassiveRefiner(
  dataDir: string,
  threshold: number,
  logger: Logger,
): PassiveRefiner {
  const log = logger.scope('profile:refine');

  return {
    maybeRefine(embedding: Float32Array, confidence: number): void {
      if (confidence < threshold) {
        log.debug('skipping refinement, confidence below threshold', {
          confidence,
          threshold,
        });
        return;
      }

      const profile = loadProfile(dataDir);
      if (profile === null) {
        log.warn('no profile found, skipping refinement');
        return;
      }

      const updated = refineProfile(profile, embedding);
      saveProfile(dataDir, updated);
      log.info('profile refined', { confidence });
    },
  };
}
