import { describe, it, expect } from 'vitest';
import {
  ENROLLMENT_PHRASES,
  createEnrollmentSession,
} from '../../src/profile/enrollment.js';
import { createLogger, LogLevel } from '../../src/logging/logger.js';

function makeLogger() {
  return createLogger({ level: LogLevel.DEBUG, ringBufferSize: 64 });
}

describe('createEnrollmentSession', () => {
  it('creates a session with correct phrase count', () => {
    const session = createEnrollmentSession(makeLogger());
    expect(session.phrasesRemaining()).toBe(ENROLLMENT_PHRASES.length);
    expect(session.status()).toBe('recording');
    expect(session.currentPrompt()).toBe(ENROLLMENT_PHRASES[0]);
    expect(session.id).toBeTruthy();
  });

  it('advances through phrases as embeddings are added', () => {
    const session = createEnrollmentSession(makeLogger());

    session.addEmbedding(new Float32Array([1, 0, 0]));
    expect(session.phrasesRemaining()).toBe(ENROLLMENT_PHRASES.length - 1);
    expect(session.currentPrompt()).toBe(ENROLLMENT_PHRASES[1]);

    session.addEmbedding(new Float32Array([0, 1, 0]));
    expect(session.phrasesRemaining()).toBe(ENROLLMENT_PHRASES.length - 2);
    expect(session.currentPrompt()).toBe(ENROLLMENT_PHRASES[2]);
  });

  it('transitions to ready_to_test when all phrases captured', () => {
    const session = createEnrollmentSession(makeLogger());

    for (let i = 0; i < ENROLLMENT_PHRASES.length; i++) {
      expect(session.status()).toBe('recording');
      session.addEmbedding(new Float32Array([i, i + 1, i + 2]));
    }

    expect(session.status()).toBe('ready_to_test');
    expect(session.phrasesRemaining()).toBe(0);
    expect(session.currentPrompt()).toBeNull();
  });

  it('compositeEmbedding averages all embeddings', () => {
    const session = createEnrollmentSession(makeLogger());

    session.addEmbedding(new Float32Array([2, 4, 6]));
    session.addEmbedding(new Float32Array([4, 6, 8]));
    session.addEmbedding(new Float32Array([6, 8, 10]));
    session.addEmbedding(new Float32Array([8, 10, 12]));
    session.addEmbedding(new Float32Array([10, 12, 14]));

    const composite = session.compositeEmbedding();
    expect(composite).not.toBeNull();
    // Average: [6, 8, 10]
    expect(composite![0]).toBeCloseTo(6, 5);
    expect(composite![1]).toBeCloseTo(8, 5);
    expect(composite![2]).toBeCloseTo(10, 5);
  });

  it('compositeEmbedding returns null when no embeddings added', () => {
    const session = createEnrollmentSession(makeLogger());
    expect(session.compositeEmbedding()).toBeNull();
  });
});
