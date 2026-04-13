import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, afterEach } from 'vitest';
import { defaultConfig, loadConfig, saveConfig } from '../../src/config.js';

describe('config', () => {
  const tempDirs: string[] = [];

  function makeTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'jarvis-config-test-'));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it('returns default config when no file exists', () => {
    const dir = makeTempDir();
    const config = loadConfig(dir);
    expect(config).toEqual(defaultConfig);
  });

  it('loads from file and merges with defaults', () => {
    const dir = makeTempDir();
    const partial = { mode: 'push-to-talk', queueMaxDepth: 20 };
    writeFileSync(join(dir, 'config.json'), JSON.stringify(partial), 'utf-8');

    const config = loadConfig(dir);
    expect(config.mode).toBe('push-to-talk');
    expect(config.queueMaxDepth).toBe(20);
    // Remaining fields come from defaults
    expect(config.vadSensitivity).toBe(defaultConfig.vadSensitivity);
    expect(config.logLevel).toBe(defaultConfig.logLevel);
    expect(config.listenTimeoutMs).toBe(defaultConfig.listenTimeoutMs);
  });

  it('saves config to file', () => {
    const dir = makeTempDir();
    const customConfig = { ...defaultConfig, mode: 'wake-word' as const, vadSensitivity: 0.8 };

    saveConfig(dir, customConfig);
    const loaded = loadConfig(dir);
    expect(loaded).toEqual(customConfig);
  });

  it('handles corrupted JSON gracefully', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'config.json'), '{not valid json!!!', 'utf-8');

    const config = loadConfig(dir);
    expect(config).toEqual(defaultConfig);
  });
});
