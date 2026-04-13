export interface VerificationResult {
  verified: boolean;
  confidence: number;
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;

  return dot / denom;
}

export function isVerifiedSpeaker(
  profile: Float32Array | null,
  sampleEmbedding: Float32Array,
  threshold: number,
): VerificationResult {
  if (profile === null) {
    return { verified: true, confidence: 1.0 };
  }

  const confidence = cosineSimilarity(profile, sampleEmbedding);
  return { verified: confidence >= threshold, confidence };
}

export function refineProfile(
  currentProfile: Float32Array,
  newEmbedding: Float32Array,
  weight: number = 0.05,
): Float32Array {
  const result = new Float32Array(currentProfile.length);
  for (let i = 0; i < currentProfile.length; i++) {
    result[i] = (1 - weight) * currentProfile[i] + weight * newEmbedding[i];
  }
  return result;
}
