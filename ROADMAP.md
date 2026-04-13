# Jarvis Voice Plugin — Roadmap

## Next Up

- [ ] **Voice selection tool** — MCP tool to switch between Kokoro voices at runtime (af_heart, af_bella, af_sky, bf_emma, bm_george) without restarting the plugin
- [ ] **Streaming TTS with worker threads** — True parallel synthesis + playback using Node.js worker threads for sub-100ms time-to-first-audio
- [ ] **Whisper hallucination filter** — Detect and discard repetitive STT output ("I'm not sure..." loops) before they reach the queue
- [ ] **Re-enrollment in quiet mode** — Command to re-enroll voice profile for better verification accuracy
- [ ] **Piper voice audition tool** — MCP tool to preview and switch between downloaded Piper voices

## Backlog

- [ ] **Wake word mode polish** — Improve wake word detection accuracy, add configurable wake word
- [ ] **Push-to-talk mode** — Keyboard shortcut to toggle mic on/off
- [ ] **Audio ducking** — Lower mic sensitivity during TTS playback to reduce echo
- [ ] **Conversation history via voice** — "Jarvis, what did I say earlier?" recall from queue history
- [ ] **Multi-language support** — Switch STT/TTS language at runtime
- [ ] **Voice activity visualization** — Terminal indicator showing when VAD detects speech
