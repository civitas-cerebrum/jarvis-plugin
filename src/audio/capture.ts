import type { Logger, ScopedLogger } from '../logging/logger.js';

export interface CaptureOptions {
  logger: Logger;
  sampleRate?: number;
  onAudioChunk: (samples: Float32Array) => void;
}

export interface AudioCapture {
  start(): void;
  stop(): void;
  isRunning(): boolean;
  destroy(): void;
}

export function createAudioCapture(options: CaptureOptions): AudioCapture {
  const log: ScopedLogger = options.logger.scope('audio:capture');
  const sampleRate = options.sampleRate ?? 16000;
  let running = false;
  let destroyed = false;

  log.info('capture created', { sampleRate });

  return {
    start(): void {
      if (destroyed) {
        log.error('cannot start — capture is destroyed');
        return;
      }
      if (running) {
        log.warn('start called while already running');
        return;
      }
      running = true;
      log.info('capture started', { sampleRate });
      // Actual PortAudio integration will be wired during integration testing.
    },

    stop(): void {
      if (!running) {
        log.warn('stop called while not running');
        return;
      }
      running = false;
      log.info('capture stopped');
    },

    isRunning(): boolean {
      return running;
    },

    destroy(): void {
      if (destroyed) {
        log.warn('destroy called on already-destroyed capture');
        return;
      }
      if (running) {
        running = false;
        log.info('capture stopped during destroy');
      }
      destroyed = true;
      log.info('capture destroyed');
    },
  };
}
