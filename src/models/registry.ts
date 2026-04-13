import { join } from "node:path";
import { existsSync } from "node:fs";

export interface ModelEntry {
  name: string;
  description: string;
  url: string;
  extractDir: string;
  sizeMb: number;
  files: string[]; // key files to verify presence
  optional?: boolean; // optional models don't block pipeline startup
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
    files: ["tiny.en-encoder.onnx", "tiny.en-decoder.onnx", "tiny.en-tokens.txt"],
  },
  {
    name: "tts-kokoro",
    description: "Kokoro TTS",
    url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-en_US-amy-low.tar.bz2",
    extractDir: "tts-kokoro",
    sizeMb: 60,
    files: ["en_US-amy-low.onnx", "tokens.txt"],
  },
  // Additional TTS voices for audition
  {
    name: "tts-alan",
    description: "Alan - British Male (low)",
    url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-en_GB-alan-low.tar.bz2",
    extractDir: "tts-alan",
    sizeMb: 60,
    files: ["en_GB-alan-low.onnx", "tokens.txt"],
    optional: true,
  },
  {
    name: "tts-alan-medium",
    description: "Alan - British Male (medium)",
    url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-en_GB-alan-medium.tar.bz2",
    extractDir: "tts-alan-medium",
    sizeMb: 80,
    files: ["en_GB-alan-medium.onnx", "tokens.txt"],
    optional: true,
  },
  {
    name: "tts-northern-english-male",
    description: "Northern English Male - British (medium)",
    url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-en_GB-northern_english_male-medium.tar.bz2",
    extractDir: "tts-northern-english-male",
    sizeMb: 80,
    files: ["en_GB-northern_english_male-medium.onnx", "tokens.txt"],
    optional: true,
  },
  {
    name: "tts-danny",
    description: "Danny - American Male (low)",
    url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-en_US-danny-low.tar.bz2",
    extractDir: "tts-danny",
    sizeMb: 60,
    files: ["en_US-danny-low.onnx", "tokens.txt"],
    optional: true,
  },
  {
    name: "tts-ryan-medium",
    description: "Ryan - American Male (medium)",
    url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-en_US-ryan-medium.tar.bz2",
    extractDir: "tts-ryan-medium",
    sizeMb: 80,
    files: ["en_US-ryan-medium.onnx", "tokens.txt"],
    optional: true,
  },
  {
    name: "tts-joe",
    description: "Joe - American Male (medium)",
    url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-en_US-joe-medium.tar.bz2",
    extractDir: "tts-joe",
    sizeMb: 80,
    files: ["en_US-joe-medium.onnx", "tokens.txt"],
    optional: true,
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
  const modelDir = getModelPath(dataDir, model.extractDir);
  return model.files.every((file) => existsSync(join(modelDir, file)));
}

export function getMissingModels(dataDir: string): ModelEntry[] {
  return MODEL_REGISTRY.filter((model) => !model.optional && !isModelPresent(dataDir, model));
}

export function getOptionalModels(): ModelEntry[] {
  return MODEL_REGISTRY.filter((model) => model.optional === true);
}
