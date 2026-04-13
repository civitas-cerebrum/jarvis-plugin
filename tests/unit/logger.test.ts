import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger, LogLevel } from '../../src/logging/logger.js';

describe('Logger', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T10:30:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('scoped logger logs with correct format fields', () => {
    const logger = createLogger({ level: LogLevel.DEBUG, ringBufferSize: 10 });
    const scoped = logger.scope('audio');

    scoped.info('stream started', { sampleRate: 16000 });

    const entries = logger.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      timestamp: '2026-01-15T10:30:00.000Z',
      level: 'INFO',
      scope: 'audio',
      message: 'stream started',
      data: { sampleRate: 16000 },
    });
  });

  it('respects log level filtering (WARN level skips DEBUG/INFO)', () => {
    const logger = createLogger({ level: LogLevel.WARN, ringBufferSize: 10 });
    const scoped = logger.scope('vad');

    scoped.debug('debug msg');
    scoped.info('info msg');
    scoped.warn('warn msg');
    scoped.error('error msg');

    const entries = logger.getEntries();
    expect(entries).toHaveLength(2);
    expect(entries[0]!.level).toBe('WARN');
    expect(entries[1]!.level).toBe('ERROR');
  });

  it('ring buffer drops oldest when full', () => {
    const logger = createLogger({ level: LogLevel.DEBUG, ringBufferSize: 3 });
    const scoped = logger.scope('test');

    scoped.info('msg-1');
    scoped.info('msg-2');
    scoped.info('msg-3');
    scoped.info('msg-4');

    const entries = logger.getEntries();
    expect(entries).toHaveLength(3);
    expect(entries[0]!.message).toBe('msg-2');
    expect(entries[1]!.message).toBe('msg-3');
    expect(entries[2]!.message).toBe('msg-4');
  });

  it('filters entries by level and scope', () => {
    const logger = createLogger({ level: LogLevel.DEBUG, ringBufferSize: 20 });
    const audio = logger.scope('audio');
    const vad = logger.scope('vad');

    audio.debug('a-debug');
    audio.info('a-info');
    audio.warn('a-warn');
    vad.info('v-info');
    vad.error('v-error');

    // Filter by scope only
    const audioEntries = logger.getEntries({ scope: 'audio' });
    expect(audioEntries).toHaveLength(3);
    expect(audioEntries.every((e) => e.scope === 'audio')).toBe(true);

    // Filter by level only (minimum WARN)
    const warnAndAbove = logger.getEntries({ level: 'WARN' });
    expect(warnAndAbove).toHaveLength(2);
    expect(warnAndAbove[0]!.message).toBe('a-warn');
    expect(warnAndAbove[1]!.message).toBe('v-error');

    // Filter by scope + level
    const vadErrors = logger.getEntries({ scope: 'vad', level: 'ERROR' });
    expect(vadErrors).toHaveLength(1);
    expect(vadErrors[0]!.message).toBe('v-error');

    // Filter by count (last N)
    const lastTwo = logger.getEntries({ count: 2 });
    expect(lastTwo).toHaveLength(2);
    expect(lastTwo[0]!.message).toBe('v-info');
    expect(lastTwo[1]!.message).toBe('v-error');
  });

  it('formatEntry produces correct string format', () => {
    const logger = createLogger({ level: LogLevel.DEBUG, ringBufferSize: 10 });

    const withData = logger.formatEntry({
      timestamp: '2026-01-15T10:30:00.000Z',
      level: 'INFO',
      scope: 'audio',
      message: 'stream started',
      data: { sampleRate: 16000 },
    });
    expect(withData).toBe(
      '[2026-01-15T10:30:00.000Z] [INFO] [audio] stream started {"sampleRate":16000}',
    );

    const withoutData = logger.formatEntry({
      timestamp: '2026-01-15T10:30:00.000Z',
      level: 'WARN',
      scope: 'vad',
      message: 'no speech detected',
    });
    expect(withoutData).toBe(
      '[2026-01-15T10:30:00.000Z] [WARN] [vad] no speech detected',
    );
  });
});
