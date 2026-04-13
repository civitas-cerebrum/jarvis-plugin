import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const PROFILE_DIR = 'profiles';
const PROFILE_FILE = 'default.bin';

function profilePath(dataDir: string): string {
  return join(dataDir, PROFILE_DIR, PROFILE_FILE);
}

export function profileExists(dataDir: string): boolean {
  return existsSync(profilePath(dataDir));
}

export function saveProfile(dataDir: string, embedding: Float32Array): void {
  const dir = join(dataDir, PROFILE_DIR);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const buf = Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
  writeFileSync(profilePath(dataDir), buf);
}

export function loadProfile(dataDir: string): Float32Array | null {
  const p = profilePath(dataDir);
  if (!existsSync(p)) {
    return null;
  }
  const buffer = readFileSync(p);
  return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / Float32Array.BYTES_PER_ELEMENT);
}

export function deleteProfile(dataDir: string): void {
  const p = profilePath(dataDir);
  if (existsSync(p)) {
    unlinkSync(p);
  }
}
