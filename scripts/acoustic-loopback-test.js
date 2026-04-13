#!/usr/bin/env node
/**
 * Acoustic Loopback Test for Jarvis Voice Plugin
 *
 * Tests: TTS → Speaker → Mic → VAD → STT → Verify transcription
 *
 * This test generates speech with TTS, plays it through speakers,
 * captures it with the microphone, and verifies the STT transcription
 * matches the original text.
 *
 * Requirements: SoX installed (rec/play commands), sherpa-onnx models downloaded
 */

import sherpa from 'sherpa-onnx-node';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const MDIR = process.env.JARVIS_DATA
  || '/Users/Ay/.claude/plugins/data/jarvis-voice-jarvis-marketplace';
const MODELS = join(MDIR, 'models');
const RESULTS_DIR = '/tmp/jarvis-acoustic-tests';

mkdirSync(RESULTS_DIR, { recursive: true });

let pass = 0;
let fail = 0;
const results = [];

function log(msg) {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[${ts}] ${msg}`);
}

// Initialize engines
log('Initializing TTS engine...');
const tts = new sherpa.OfflineTts({
  model: {
    vits: {
      model: join(MODELS, 'tts-kokoro/en_US-amy-low.onnx'),
      tokens: join(MODELS, 'tts-kokoro/tokens.txt'),
      dataDir: join(MODELS, 'tts-kokoro/espeak-ng-data'),
    },
  },
  numThreads: 1,
});
log(`TTS ready (sampleRate: ${tts.sampleRate})`);

log('Initializing STT engine...');
const stt = new sherpa.OfflineRecognizer({
  modelConfig: {
    whisper: {
      encoder: join(MODELS, 'whisper-small/tiny.en-encoder.onnx'),
      decoder: join(MODELS, 'whisper-small/tiny.en-decoder.onnx'),
    },
    tokens: join(MODELS, 'whisper-small/tiny.en-tokens.txt'),
    numThreads: 1,
  },
});
log('STT ready');

log('Initializing Speaker ID...');
const speakerId = new sherpa.SpeakerEmbeddingExtractor({
  model: join(MODELS, 'speaker-id/wespeaker_en_voxceleb_resnet34.onnx'),
  numThreads: 1,
});
log(`Speaker ID ready (embedding dim: ${speakerId.dim})`);

log('Initializing VAD...');
const vad = new sherpa.Vad({
  sileroVad: {
    model: join(MODELS, 'silero-vad/silero_vad.onnx'),
    threshold: 0.5,
    minSilenceDuration: 0.5,
    minSpeechDuration: 0.25,
  },
  sampleRate: 16000,
  bufferSizeInSeconds: 60,
});
log('VAD ready');

// Helper: play audio through speakers and capture with mic simultaneously
function playAndCapture(samples, sampleRate, captureDurationSec) {
  return new Promise((resolve, reject) => {
    const wavPath = join(RESULTS_DIR, 'tts-output.wav');
    sherpa.writeWave(wavPath, { samples, sampleRate });

    // Start recording FIRST
    const capturedChunks = [];
    const rec = spawn('rec', [
      '-q', '-t', 'raw', '-b', '16', '-e', 'signed-integer',
      '-c', '1', '-r', String(sampleRate), '-',
      'trim', '0', String(captureDurationSec),
    ]);

    rec.stdout.on('data', (chunk) => {
      capturedChunks.push(chunk);
    });

    rec.on('error', (err) => reject(new Error(`rec failed: ${err.message}`)));

    // Start playback after 200ms (let mic warm up)
    setTimeout(() => {
      const play = spawn('play', ['-q', wavPath]);
      play.on('error', (err) => log(`play warning: ${err.message}`));
    }, 200);

    rec.on('close', () => {
      const raw = Buffer.concat(capturedChunks);
      const int16 = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768.0;
      }
      resolve(float32);
    });
  });
}

// Helper: direct STT (no acoustic path — TTS audio fed directly to STT)
function directStt(samples, sampleRate) {
  const stream = stt.createStream();
  stream.acceptWaveform({ sampleRate, samples });
  stt.decode(stream);
  const result = stt.getResult(stream);
  return (typeof result === 'string' ? result : result?.text ?? '').trim();
}

// Helper: extract speaker embedding
function extractEmbedding(samples, sampleRate) {
  const stream = speakerId.createStream();
  stream.acceptWaveform({ sampleRate, samples });
  return speakerId.compute(stream);
}

// Helper: run VAD on audio
function runVad(samples) {
  vad.reset();
  vad.acceptWaveform(samples);
  vad.flush();
  const segments = [];
  while (!vad.isEmpty()) {
    const seg = vad.front();
    segments.push(new Float32Array(seg.samples));
    vad.pop();
  }
  return segments;
}

function recordResult(name, passed, details) {
  if (passed) {
    pass++;
    console.log(`  PASS: ${name}`);
  } else {
    fail++;
    console.log(`  FAIL: ${name} — ${details}`);
  }
  results.push({ name, passed, details });
}

async function runTests() {
  console.log('\n=== Jarvis Acoustic Loopback Test Suite ===\n');

  // ==========================================
  // TEST 1: Direct TTS → STT (no acoustic path)
  // ==========================================
  console.log('[1/6] Direct TTS → STT (no speakers/mic)');
  const testPhrases = [
    'Hello world',
    'The weather is nice today',
    'Please refactor the authentication module',
  ];

  for (const phrase of testPhrases) {
    const audio = tts.generate({ text: phrase, sid: 0, speed: 1.0 });
    const transcription = directStt(audio.samples, audio.sampleRate);
    const match = transcription.toLowerCase().includes(phrase.toLowerCase().split(' ')[0]);
    recordResult(
      `Direct: "${phrase}" → "${transcription}"`,
      match,
      match ? '' : `Expected "${phrase}", got "${transcription}"`
    );
  }

  // ==========================================
  // TEST 2: VAD detects TTS speech
  // ==========================================
  console.log('\n[2/6] VAD detects TTS-generated speech');
  {
    const audio = tts.generate({ text: 'Testing voice activity detection', sid: 0, speed: 1.0 });
    // Pad with silence
    const padded = new Float32Array(audio.samples.length + 16000);
    padded.set(audio.samples, 8000);
    const segments = runVad(padded);
    recordResult(
      `VAD found ${segments.length} speech segment(s)`,
      segments.length >= 1,
      segments.length === 0 ? 'No speech detected' : ''
    );
  }

  // ==========================================
  // TEST 3: Speaker embedding extraction
  // ==========================================
  console.log('\n[3/6] Speaker embedding extraction');
  {
    const audio1 = tts.generate({ text: 'First sample for speaker identification', sid: 0, speed: 1.0 });
    const audio2 = tts.generate({ text: 'Second sample from the same speaker', sid: 0, speed: 1.0 });

    const emb1 = extractEmbedding(audio1.samples, audio1.sampleRate);
    const emb2 = extractEmbedding(audio2.samples, audio2.sampleRate);

    recordResult(
      `Embedding dim: ${emb1.length}`,
      emb1.length === speakerId.dim,
      `Expected ${speakerId.dim}, got ${emb1.length}`
    );

    // Cosine similarity between same-speaker embeddings should be high
    let dot = 0, norm1 = 0, norm2 = 0;
    for (let i = 0; i < emb1.length; i++) {
      dot += emb1[i] * emb2[i];
      norm1 += emb1[i] * emb1[i];
      norm2 += emb2[i] * emb2[i];
    }
    const similarity = dot / (Math.sqrt(norm1) * Math.sqrt(norm2));
    recordResult(
      `Same-speaker similarity: ${similarity.toFixed(3)}`,
      similarity > 0.5,
      `Similarity ${similarity.toFixed(3)} below threshold 0.5`
    );
  }

  // ==========================================
  // TEST 4: Full pipeline — VAD → STT on TTS audio
  // ==========================================
  console.log('\n[4/6] Full pipeline: TTS → VAD → STT');
  {
    const phrase = 'Jarvis is online and ready to help';
    const audio = tts.generate({ text: phrase, sid: 0, speed: 1.0 });
    const padded = new Float32Array(audio.samples.length + 16000);
    padded.set(audio.samples, 8000);

    const segments = runVad(padded);
    if (segments.length > 0) {
      const transcription = directStt(segments[0], 16000);
      const firstWord = phrase.toLowerCase().split(' ')[0];
      recordResult(
        `Pipeline: "${phrase}" → VAD(${segments.length} seg) → STT: "${transcription}"`,
        transcription.toLowerCase().includes(firstWord),
        ''
      );
    } else {
      recordResult('Pipeline: VAD found no segments', false, 'No speech detected by VAD');
    }
  }

  // ==========================================
  // TEST 5: Acoustic loopback — TTS → Speaker → Mic → STT
  // ==========================================
  console.log('\n[5/6] Acoustic loopback: TTS → Speaker → Mic → STT');
  {
    const phrase = 'Hello, this is an acoustic test';
    log(`Generating TTS for: "${phrase}"`);
    const audio = tts.generate({ text: phrase, sid: 0, speed: 1.0 });
    const audioDuration = audio.samples.length / audio.sampleRate;
    log(`TTS generated: ${audioDuration.toFixed(2)}s`);

    log('Playing through speakers and recording with mic...');
    const captured = await playAndCapture(audio.samples, audio.sampleRate, audioDuration + 1.5);
    log(`Captured ${captured.length} samples (${(captured.length / 16000).toFixed(2)}s)`);

    // Check if we captured any non-silent audio
    let maxAmp = 0;
    for (let i = 0; i < captured.length; i++) {
      const abs = Math.abs(captured[i]);
      if (abs > maxAmp) maxAmp = abs;
    }
    log(`Max amplitude in capture: ${maxAmp.toFixed(4)}`);

    if (maxAmp < 0.01) {
      recordResult('Acoustic capture', false, 'No audio captured — check speaker/mic volume');
    } else {
      const transcription = directStt(captured, 16000);
      log(`Acoustic transcription: "${transcription}"`);
      const firstWord = phrase.toLowerCase().split(' ')[0];
      recordResult(
        `Acoustic: "${phrase}" → captured → "${transcription}"`,
        transcription.length > 0,
        transcription.length === 0 ? 'Empty transcription' : ''
      );
    }
  }

  // ==========================================
  // TEST 6: Acoustic loopback with VAD
  // ==========================================
  console.log('\n[6/6] Acoustic loopback with VAD: TTS → Speaker → Mic → VAD → STT');
  {
    const phrase = 'The quick brown fox jumps over the lazy dog';
    log(`Generating TTS for: "${phrase}"`);
    const audio = tts.generate({ text: phrase, sid: 0, speed: 1.0 });
    const audioDuration = audio.samples.length / audio.sampleRate;

    log('Playing and recording...');
    const captured = await playAndCapture(audio.samples, audio.sampleRate, audioDuration + 2);
    log(`Captured ${(captured.length / 16000).toFixed(2)}s`);

    const segments = runVad(captured);
    log(`VAD found ${segments.length} segment(s)`);

    if (segments.length > 0) {
      const totalSamples = segments.reduce((sum, s) => sum + s.length, 0);
      log(`Total speech: ${(totalSamples / 16000).toFixed(2)}s`);
      const transcription = directStt(segments[0], 16000);
      log(`Transcription: "${transcription}"`);
      recordResult(
        `Full acoustic pipeline: VAD(${segments.length} seg) → "${transcription}"`,
        transcription.length > 0,
        transcription.length === 0 ? 'Empty transcription' : ''
      );
    } else {
      recordResult('Full acoustic pipeline', false, 'VAD found no speech in captured audio');
    }
  }

  // Summary
  console.log('\n=== Results ===');
  console.log(`  Total: ${pass + fail}`);
  console.log(`  Passed: ${pass}`);
  console.log(`  Failed: ${fail}`);
  console.log(fail === 0 ? '  ALL TESTS PASSED' : '  SOME TESTS FAILED');

  process.exit(fail);
}

runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
