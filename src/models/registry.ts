import { join } from "node:path";
import { existsSync } from "node:fs";

export interface ModelEntry {
  name: string;
  description: string;
  url: string;
  extractDir: string;
  sizeMb: number;
  files: string[]; // key files to verify presence
}

export const MODEL_REGISTRY: ModelEntry[] = [
  {
    name: "silero-vad",
    description: "Silero VAD",
    url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx",
    extractDir: "silero-vad",
    sizeMb: 2,
    files: ["silero_vad.onnx"],
  },
  {
    name: "whisper-small",
    description: "Whisper Small STT",
    url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-tiny.en.tar.bz2",
    extractDir: "whisper-small",
    sizeMb: 150,
    files: ["tiny-encoder.onnx", "tiny-decoder.onnx", "tokens.txt"],
  },
  {
    name: "tts-kokoro",
    description: "Kokoro TTS",
    url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-en-v1.0.tar.bz2",
    extractDir: "tts-kokoro",
    sizeMb: 100,
    files: ["kokoro-v1.0.onnx", "voices-v1.0.bin", "tokens.txt"],
  },
  {
    name: "speaker-id",
    description: "WeSpeaker ResNet34",
    url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/wespeaker_en_voxceleb_resnet34.onnx",
    extractDir: "speaker-id",
    sizeMb: 20,
    files: ["wespeaker_en_voxceleb_resnet34.onnx"],
  },
];

export function getModelPath(dataDir: string, modelName: string): string {
  return join(dataDir, "models", modelName);
}

export function getModelEntry(name: string): ModelEntry | undefined {
  return MODEL_REGISTRY.find((entry) => entry.name === name);
}

export function isModelPresent(dataDir: string, model: ModelEntry): boolean {
  const modelDir = getModelPath(dataDir, model.name);
  return model.files.every((file) => existsSync(join(modelDir, file)));
}

export function getMissingModels(dataDir: string): ModelEntry[] {
  return MODEL_REGISTRY.filter((model) => !isModelPresent(dataDir, model));
}
