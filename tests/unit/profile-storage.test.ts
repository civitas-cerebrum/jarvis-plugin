import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { profileExists, saveProfile, loadProfile, deleteProfile } from '../../src/profile/storage.js';

describe('profile storage', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'jarvis-profile-test-'));
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('reports no profile when directory is empty', () => {
    expect(profileExists(dataDir)).toBe(false);
  });

  it('saves and loads a Float32Array embedding', () => {
    const embedding = new Float32Array([0.1, 0.2, 0.3, -0.5, 1.0]);
    saveProfile(dataDir, embedding);

    expect(profileExists(dataDir)).toBe(true);

    const loaded = loadProfile(dataDir);
    expect(loaded).not.toBeNull();
    expect(loaded!.length).toBe(embedding.length);

    for (let i = 0; i < embedding.length; i++) {
      expect(loaded![i]).toBeCloseTo(embedding[i], 5);
    }
  });

  it('deletes a profile', () => {
    const embedding = new Float32Array([1.0, 2.0]);
    saveProfile(dataDir, embedding);
    expect(profileExists(dataDir)).toBe(true);

    deleteProfile(dataDir);
    expect(profileExists(dataDir)).toBe(false);
  });

  it('loadProfile returns null when no profile exists', () => {
    const result = loadProfile(dataDir);
    expect(result).toBeNull();
  });
});
