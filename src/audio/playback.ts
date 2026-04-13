import type { Logger, ScopedLogger } from '../logging/logger.js';

export interface PlaybackOptions {
  logger: Logger;
  onPlaybackComplete?: () => void;
  onInterrupted?: () => void;
}

export interface PlaybackResult {
  interrupted: boolean;
}

export interface AudioPlayback {
  play(samples: Float32Array, sampleRate: number): Promise<PlaybackResult>;
  stop(): void;
  isPlaying(): boolean;
  destroy(): void;
}

export function createAudioPlayback(options: PlaybackOptions): AudioPlayback {
  const log: ScopedLogger = options.logger.scope('audio:playback');
  let playing = false;
  let destroyed = false;
  let currentTimer: ReturnType<typeof setTimeout> | undefined;
  let currentResolve: ((result: PlaybackResult) => void) | undefined;

  log.info('playback created');

  return {
    play(samples: Float32Array, sampleRate: number): Promise<PlaybackResult> {
      if (destroyed) {
        log.error('cannot play — playback is destroyed');
        return Promise.resolve({ interrupted: false });
      }
      if (playing) {
        log.warn('play called while already playing');
        return Promise.resolve({ interrupted: false });
      }

      playing = true;
      const durationMs = (samples.length / sampleRate) * 1000;
      log.info('playback started', { samples: samples.length, sampleRate, durationMs });

      return new Promise<PlaybackResult>((resolve) => {
        currentResolve = resolve;
        currentTimer = setTimeout(() => {
          playing = false;
          currentTimer = undefined;
          currentResolve = undefined;
          log.info('playback complete');
          options.onPlaybackComplete?.();
          resolve({ interrupted: false });
        }, durationMs);
      });
    },

    stop(): void {
      if (!playing) {
        log.warn('stop called while not playing');
        return;
      }

      if (currentTimer !== undefined) {
        clearTimeout(currentTimer);
        currentTimer = undefined;
      }

      playing = false;
      log.info('playback stopped (interrupted)');

      const resolve = currentResolve;
      currentResolve = undefined;
      if (resolve) {
        resolve({ interrupted: true });
      }

      options.onInterrupted?.();
    },

    isPlaying(): boolean {
      return playing;
    },

    destroy(): void {
      if (destroyed) {
        log.warn('destroy called on already-destroyed playback');
        return;
      }
      if (playing) {
        if (currentTimer !== undefined) {
          clearTimeout(currentTimer);
          currentTimer = undefined;
        }
        playing = false;

        const resolve = currentResolve;
        currentResolve = undefined;
        if (resolve) {
          resolve({ interrupted: true });
        }

        options.onInterrupted?.();
        log.info('playback stopped during destroy');
      }
      destroyed = true;
      log.info('playback destroyed');
    },
  };
}
