/**
 * TTS Worker Thread — synthesizes text in a background thread.
 *
 * Usage: create a Worker with this file, passing model config in workerData.
 * Send { type: 'synthesize', text, sid, speed } messages.
 * Receives { type: 'result', samples: Float32Array, sampleRate } back.
 */
import { parentPort, workerData } from 'node:worker_threads';
import sherpa from 'sherpa-onnx-node';

interface WorkerConfig {
  kokoro: {
    model: string;
    voices: string;
    tokens: string;
    dataDir: string;
  };
}

const config = workerData as WorkerConfig;

const tts = new sherpa.OfflineTts({
  model: { kokoro: config.kokoro },
  numThreads: 1,
});

parentPort!.postMessage({ type: 'ready' });

parentPort!.on('message', (msg: { type: string; text: string; sid: number; speed: number }) => {
  if (msg.type === 'synthesize') {
    try {
      const result = tts.generate({ text: msg.text, sid: msg.sid, speed: msg.speed });
      // Copy samples — native buffers can't be transferred across threads
      const samples = new Float32Array(result.samples);
      parentPort!.postMessage({
        type: 'result',
        samples,
        sampleRate: result.sampleRate,
      });
    } catch (err: unknown) {
      parentPort!.postMessage({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
});
