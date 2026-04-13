import { describe, it, expect } from "vitest";
import {
  MODEL_REGISTRY,
  getModelPath,
  getModelEntry,
  getMissingModels,
} from "../../../src/models/registry.js";

const REQUIRED_MODELS = ["silero-vad", "whisper-small", "tts-kokoro", "speaker-id"];

describe("MODEL_REGISTRY", () => {
  it("contains entries for all 4 required models", () => {
    const names = MODEL_REGISTRY.map((m) => m.name);
    for (const required of REQUIRED_MODELS) {
      expect(names).toContain(required);
    }
  });

  it("every entry has required fields with valid values", () => {
    for (const entry of MODEL_REGISTRY) {
      expect(entry.name).toBeTruthy();
      expect(entry.description).toBeTruthy();
      expect(entry.url).toMatch(/^https:\/\//);
      expect(entry.extractDir).toBeTruthy();
      expect(entry.sizeMb).toBeGreaterThan(0);
      expect(entry.files.length).toBeGreaterThan(0);
    }
  });
});

describe("getModelPath", () => {
  it("returns correct path", () => {
    const result = getModelPath("/data", "whisper-small");
    expect(result).toBe("/data/models/whisper-small");
  });
});

describe("getModelEntry", () => {
  it("returns the entry for a known model", () => {
    const entry = getModelEntry("silero-vad");
    expect(entry).toBeDefined();
    expect(entry!.name).toBe("silero-vad");
  });

  it("returns undefined for an unknown model", () => {
    expect(getModelEntry("nonexistent")).toBeUndefined();
  });
});

describe("getMissingModels", () => {
  it("reports all models when directory does not exist", () => {
    const missing = getMissingModels("/nonexistent/path");
    expect(missing).toHaveLength(MODEL_REGISTRY.length);
    const names = missing.map((m) => m.name);
    for (const required of REQUIRED_MODELS) {
      expect(names).toContain(required);
    }
  });
});
