import { spawn, type ChildProcess } from 'node:child_process';
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

const INT16_MAX = 32768;

function float32ToInt16Buffer(samples: Float32Array): Buffer {
  const buf = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    // Clamp to [-1, 1] then scale to Int16 range
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const int16 = Math.round(clamped * (INT16_MAX - 1));
    buf.writeInt16LE(int16, i * 2);
  }
  return buf;
}

export function createAudioPlayback(options: PlaybackOptions): AudioPlayback {
  const log: ScopedLogger = options.logger.scope('audio:playback');
  let playing = false;
  let destroyed = false;
  let proc: ChildProcess | null = null;
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

      const pcmBuffer = float32ToInt16Buffer(samples);

      return new Promise<PlaybackResult>((resolve) => {
        currentResolve = resolve;

        const args = [
          '-q', '-t', 'raw', '-b', '16', '-e', 'signed-integer',
          '-c', '1', '-r', String(sampleRate), '-',
        ];

        proc = spawn('play', args, { stdio: ['pipe', 'ignore', 'pipe'] });

        proc.stderr?.on('data', (chunk: Buffer) => {
          const msg = chunk.toString().trim();
          if (msg.length > 0) {
            log.error('play stderr', { message: msg });
          }
        });

        proc.on('error', (err: Error) => {
          log.error('play process error', { error: err.message });
          playing = false;
          proc = null;
          const r = currentResolve;
          currentResolve = undefined;
          if (r) r({ interrupted: false });
        });

        proc.on('close', (_code: number | null) => {
          // If currentResolve is still set, the process exited naturally
          const r = currentResolve;
          if (r) {
            playing = false;
            proc = null;
            currentResolve = undefined;
            log.info('playback complete');
            options.onPlaybackComplete?.();
            r({ interrupted: false });
          }
        });

        // Write PCM data to stdin and close it so play knows input is done
        proc.stdin?.write(pcmBuffer, () => {
          proc?.stdin?.end();
        });
      });
    },

    stop(): void {
      if (!playing) {
        log.warn('stop called while not playing');
        return;
      }

      if (proc) {
        proc.kill('SIGTERM');
        proc = null;
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
        if (proc) {
          proc.kill('SIGTERM');
          proc = null;
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
