import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface JarvisConfig {
  mode: 'vad' | 'push-to-talk' | 'wake-word';
  vadSensitivity: number;
  speakerConfidenceThreshold: number;
  passiveRefineThreshold: number;
  queueMaxDepth: number;
  listenTimeoutMs: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  consecutiveRejectionsBeforeWarning: number;
}

export const defaultConfig: JarvisConfig = {
  mode: 'vad',
  vadSensitivity: 0.5,
  speakerConfidenceThreshold: 0.5,
  passiveRefineThreshold: 0.7,
  queueMaxDepth: 10,
  listenTimeoutMs: 30_000,
  logLevel: 'debug',
  consecutiveRejectionsBeforeWarning: 10,
};

export function loadConfig(dataDir: string): JarvisConfig {
  const filePath = join(dataDir, 'config.json');
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { ...defaultConfig, ...(parsed as Partial<JarvisConfig>) };
    }
    return { ...defaultConfig };
  } catch {
    return { ...defaultConfig };
  }
}

export function saveConfig(dataDir: string, config: JarvisConfig): void {
  mkdirSync(dataDir, { recursive: true });
  const filePath = join(dataDir, 'config.json');
  writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8');
}
