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
    queue.setMode('active');

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
    queue.setMode('active');

    queue.push(makeEntry('a'));
    queue.push(makeEntry('b'));
    queue.push(makeEntry('c'));

    expect(queue.depth()).toBe(2);
    expect(queue.pop()!.text).toBe('b');
    expect(queue.pop()!.text).toBe('c');
  });

  it('waitForNext resolves when entry is pushed', async () => {
    const queue = createTranscriptionQueue({ maxDepth: 10, logger: makeLogger() });
    queue.setMode('active');

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

  it('accumulates segments up to max limit of 20', async () => {
    const queue = createTranscriptionQueue({
      maxDepth: 50,
      logger: makeLogger(),
      silenceGapMs: 100,
    });
    queue.setMode('active');

    // Push 25 entries rapidly — only 20 should be accumulated due to safety limit
    const waitPromise = queue.waitForNext(5000);

    // Push first entry to start accumulation, then push more before silence gap
    queue.push(makeEntry('seg-0'));
    for (let i = 1; i <= 24; i++) {
      setTimeout(() => queue.push(makeEntry(`seg-${i}`)), i * 5);
    }

    const entry = await waitPromise;
    expect(entry).not.toBeNull();
    // Should have accumulated exactly 20 segments (the safety limit)
    const segCount = entry!.text.split(' ').length;
    expect(segCount).toBe(20);
  });

  it('pops existing entry immediately from waitForNext', async () => {
    const queue = createTranscriptionQueue({ maxDepth: 10, logger: makeLogger() });
    queue.setMode('active');

    queue.push(makeEntry('already-there'));

    const entry = await queue.waitForNext(1000);
    expect(entry).not.toBeNull();
    expect(entry!.text).toBe('already-there');
    expect(queue.depth()).toBe(0);
  });
});
