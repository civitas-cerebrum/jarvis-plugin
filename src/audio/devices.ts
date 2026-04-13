import { execFileSync } from 'node:child_process';
import type { Logger, ScopedLogger } from '../logging/logger.js';

export interface AudioDevice {
  id: number;
  name: string;
  isDefault: boolean;
  maxInputChannels: number;
  maxOutputChannels: number;
}

export function listAudioDevices(logger: Logger): AudioDevice[] {
  const log: ScopedLogger = logger.scope('audio:devices');

  log.info('enumerating audio devices');

  // Verify SoX is available by running `rec --help`
  let soxAvailable = false;
  try {
    execFileSync('rec', ['--help'], { stdio: 'pipe', timeout: 5000 });
    soxAvailable = true;
  } catch (err: unknown) {
    // rec --help exits with non-zero but still prints help; check if it was
    // a spawn error (command not found) vs a normal non-zero exit.
    if (err instanceof Error && 'code' in err) {
      const spawnErr = err as NodeJS.ErrnoException;
      if (spawnErr.code === 'ENOENT') {
        log.warn('SoX not found — rec command is not available on PATH');
        log.warn('Install SoX: brew install sox');
        return [];
      }
    }
    // Non-zero exit is fine — rec --help typically exits 1 but still works
    soxAvailable = true;
  }

  if (!soxAvailable) {
    return [];
  }

  log.info('SoX detected, using default system audio devices');

  // SoX uses the system default input/output devices; it does not expose
  // per-device enumeration like PortAudio. We report the defaults.
  const devices: AudioDevice[] = [
    {
      id: 0,
      name: 'SoX Default Input (system microphone)',
      isDefault: true,
      maxInputChannels: 1,
      maxOutputChannels: 0,
    },
    {
      id: 1,
      name: 'SoX Default Output (system speakers)',
      isDefault: true,
      maxInputChannels: 0,
      maxOutputChannels: 1,
    },
  ];

  log.info('found audio devices', { count: devices.length });
  return devices;
}
