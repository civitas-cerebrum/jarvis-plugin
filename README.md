# Jarvis Voice Plugin

A voice-driven interaction plugin for Claude Code. Local speech-to-text, text-to-speech, and speaker verification — fully offline, fully hands-free.

## What It Does

Jarvis turns Claude Code into a voice assistant. You speak, it listens. It speaks back. No cloud APIs, no latency penalties — everything runs on-device.

### Pipeline

```
Mic (SoX rec) → 16kHz Downsample → VAD (Silero) → Denoiser (GTCRN)
    → Speaker Verification (WeSpeaker) → STT (Whisper tiny.en)
    → Transcription Queue → Claude Code

Claude Code → TTS (Kokoro 24kHz) → Temp File → SoX play → Speakers
```

### Features

- **Kokoro TTS** — High-quality neural text-to-speech at 24kHz with 11 voice options
- **Whisper STT** — Local speech-to-text using Whisper tiny.en
- **Speaker Verification** — WeSpeaker embeddings ensure only the enrolled user's voice is processed
- **Speech Denoiser** — GTCRN model provides ~34dB noise reduction before processing
- **Voice Activity Detection** — Silero VAD detects speech segments in real-time
- **Speech Accumulation** — Consecutive speech segments are merged with 3-second silence gap detection, delivering complete sentences instead of fragments
- **Pause/Resume** — Say "Jarvis pause" to mute listening, "Jarvis resume" to restart
- **Wake Word** (optional) — Queue filtering mode that only passes messages starting with "Jarvis"
- **Listening Indicator** — Short tone plays when the assistant is ready for input
- **Concurrent Capture** — Mic stays active during TTS playback so user speech queues up
- **Acoustic Self-Test** — Loopback test that speaks a phrase and verifies transcription through the full pipeline

### Voice Enrollment

On first run, Jarvis guides you through 5 phrases to build a speaker profile. This profile is used for speaker verification — filtering out background voices and ambient noise.

## Architecture

```
src/
  main.ts                  — Entry point, MCP server + orchestrator
  mcp/
    entry.ts               — JSON-RPC stdio server with lifecycle handlers
    tools.ts               — MCP tool definitions and handlers
  pipeline/
    orchestrator.ts        — Coordinates all pipeline components
    vad.ts                 — Voice Activity Detection (Silero)
    stt.ts                 — Speech-to-Text (Whisper)
    tts.ts                 — Text-to-Speech (Kokoro / Piper VITS fallback)
    queue.ts               — Transcription queue with wake word filtering,
                             pause/resume, and speech accumulation
    embedding-extractor.ts — Speaker embedding extraction
    speaker-verify.ts      — Cosine similarity speaker verification
  audio/
    capture.ts             — Mic capture via SoX rec with rate downsampling
    playback.ts            — Audio playback via SoX play with temp files
  profile/
    enrollment.ts          — Voice enrollment session management
    storage.ts             — Profile persistence
    passive-refine.ts      — Background profile refinement
  models/
    registry.ts            — Model registry with optional voice downloads
    downloader.ts          — Model download and extraction
  config.ts                — Runtime configuration
  logging/
    logger.ts              — Ring buffer logger with scoped contexts
```

## Models

| Model | Purpose | Size |
|-------|---------|------|
| Silero VAD | Voice activity detection | 2 MB |
| Whisper tiny.en | Speech-to-text | 150 MB |
| WeSpeaker ResNet34 | Speaker verification | 20 MB |
| Kokoro v0.19 | Text-to-speech (24kHz) | 330 MB |
| Kokoro voices | Voice embeddings | 5.5 MB |
| GTCRN | Speech denoising | 0.5 MB |

## MCP Tools

| Tool | Description |
|------|-------------|
| `GetVoiceStatus` | Pipeline state, VAD activity, listening mode, pause state |
| `ListenForResponse` | Block until speech detected (with accumulation) |
| `SpeakText` | TTS synthesis + playback, supports `expect_response` for Q&A flow |
| `StartEnrollment` | Begin/advance voice enrollment session |
| `TestEnrollment` | Verify enrollment quality |
| `SaveProfile` | Persist voice profile |
| `ResetProfile` | Delete voice profile |
| `SetMode` | Change capture mode |
| `SetThreshold` | Adjust VAD sensitivity or speaker confidence at runtime |
| `DownloadModels` | Download missing ML models |
| `GetDebugLog` | Ring buffer log entries |
| `GetSessionStats` | Utterance counts, verification rates, latency stats |

## Installation

### Prerequisites

- **macOS** (CoreAudio required for mic capture)
- **Node.js 18+**
- **SoX** — audio capture and playback
  ```bash
  brew install sox
  ```

### Install as Claude Code Plugin

```bash
# Add the Jarvis marketplace
/plugin marketplace add civitas-cerebrum/jarvis-plugin

# Install the plugin
/plugin install jarvis-voice@jarvis-marketplace
```

Dependencies install automatically on first session start. Voice models (~300MB) download on first use.

### Activate

Start a Claude Code session and say:
```
/jarvis-voice:jarvis-voice
```

On first run, Jarvis will guide you through voice enrollment (~30 seconds) to learn your voice for speaker verification.

## Development

```bash
npm install
npm run build
npm test                           # 67 unit tests
npx vitest run tests/acoustic/     # Acoustic loopback self-test (needs mic + speakers)
```

## Stability Fixes

The plugin includes several reliability improvements discovered during development:

- **File-based playback** — SoX `play` doesn't handle Node.js socketpair stdin correctly; writing PCM to temp files avoids truncated audio
- **SoX rate effect** — macOS audio hardware doesn't support 16kHz capture natively; `rec` with the `rate` SoX effect downsamples from 48kHz
- **Readline lifecycle** — MCP stdio server registers close/error handlers to prevent orphan processes
- **EPIPE tolerance** — Process-level `uncaughtException` handler treats EPIPE as non-fatal
- **Deferred speech processing** — `setImmediate` prevents native addon calls from blocking the event loop during MCP I/O
