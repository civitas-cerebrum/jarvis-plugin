import { describe, it, expect } from 'vitest';
import {
  cosineSimilarity,
  isVerifiedSpeaker,
  refineProfile,
} from '../../src/pipeline/speaker-verify.js';

describe('cosineSimilarity', () => {
  it('returns 1.0 for identical vectors', () => {
    const v = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
  });

  it('returns 0.0 for orthogonal vectors', () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([0, 1]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 5);
  });

  it('returns -1.0 for opposite vectors', () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([-1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 5);
  });
});

describe('isVerifiedSpeaker', () => {
  it('returns true above threshold for similar vectors', () => {
    const profile = new Float32Array([1, 0, 0]);
    const sample = new Float32Array([0.9, 0.1, 0]);
    const result = isVerifiedSpeaker(profile, sample, 0.9);
    expect(result.verified).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('returns false below threshold for orthogonal vectors', () => {
    const profile = new Float32Array([1, 0]);
    const sample = new Float32Array([0, 1]);
    const result = isVerifiedSpeaker(profile, sample, 0.5);
    expect(result.verified).toBe(false);
    expect(result.confidence).toBeCloseTo(0.0, 5);
  });

  it('passes all when profile is null (pre-enrollment mode)', () => {
    const sample = new Float32Array([1, 2, 3]);
    const result = isVerifiedSpeaker(null, sample, 0.99);
    expect(result.verified).toBe(true);
    expect(result.confidence).toBe(1.0);
  });
});
