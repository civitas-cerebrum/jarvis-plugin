import { describe, it, expect } from 'vitest';
import { createTranscriptionQueue } from '../../src/pipeline/queue.js';
import type { TranscriptionEntry } from '../../src/pipeline/queue.js';
import { createLogger, LogLevel } from '../../src/logging/logger.js';

function makeEntry(text: string, confidence = 0.9): TranscriptionEntry {
  return { text, confidence, timestamp: Date.now(), durationMs: 100, lowQuality: false };
}

function makeLogger() {
  return createLogger({ level: LogLevel.DEBUG, ringBufferSize: 100 });
}

describe('TranscriptionQueue', () => {
  it('pushes and pops in FIFO order', () => {
    const queue = createTranscriptionQueue({ maxDepth: 10, logger: makeLogger() });

    queue.push(makeEntry('first'));
    queue.push(makeEntry('second'));
    queue.push(makeEntry('third'));

    expect(queue.pop()!.text).toBe('first');
    expect(queue.pop()!.text).toBe('second');
    expect(queue.pop()!.text).toBe('third');
  });

  it('returns null when empty', () => {
    const queue = createTranscriptionQueue({ maxDepth: 10, logger: makeLogger() });

    expect(queue.pop()).toBeNull();
  });

  it('drops oldest when max depth exceeded', () => {
    const queue = createTranscriptionQueue({ maxDepth: 2, logger: makeLogger() });

    queue.push(makeEntry('a'));
    queue.push(makeEntry('b'));
    queue.push(makeEntry('c'));

    expect(queue.depth()).toBe(2);
    expect(queue.pop()!.text).toBe('b');
    expect(queue.pop()!.text).toBe('c');
  });

  it('waitForNext resolves when entry is pushed', async () => {
    const queue = createTranscriptionQueue({ maxDepth: 10, logger: makeLogger() });

    setTimeout(() => {
      queue.push(makeEntry('delayed'));
    }, 10);

    const entry = await queue.waitForNext(1000);
    expect(entry).not.toBeNull();
    expect(entry!.text).toBe('delayed');
  });

  it('waitForNext returns null on timeout', async () => {
    const queue = createTranscriptionQueue({ maxDepth: 10, logger: makeLogger() });

    const entry = await queue.waitForNext(50);
    expect(entry).toBeNull();
  });

  it('pops existing entry immediately from waitForNext', async () => {
    const queue = createTranscriptionQueue({ maxDepth: 10, logger: makeLogger() });

    queue.push(makeEntry('already-there'));

    const entry = await queue.waitForNext(1000);
    expect(entry).not.toBeNull();
    expect(entry!.text).toBe('already-there');
    expect(queue.depth()).toBe(0);
  });
});
