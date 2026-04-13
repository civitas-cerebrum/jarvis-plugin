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

  // Stub: return default input and output devices.
  // Actual PortAudio enumeration will be wired during integration testing.
  const devices: AudioDevice[] = [
    {
      id: 0,
      name: 'Default Input Device',
      isDefault: true,
      maxInputChannels: 2,
      maxOutputChannels: 0,
    },
    {
      id: 1,
      name: 'Default Output Device',
      isDefault: true,
      maxInputChannels: 0,
      maxOutputChannels: 2,
    },
  ];

  log.info('found audio devices', { count: devices.length });
  return devices;
}
