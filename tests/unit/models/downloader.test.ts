import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { downloadModel } from "../../../src/models/downloader.js";
import { createLogger, LogLevel } from "../../../src/logging/logger.js";
import type { ModelEntry } from "../../../src/models/registry.js";

function makeTempDir(): string {
  const dir = join(tmpdir(), `downloader-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeLogger() {
  return createLogger({ level: LogLevel.DEBUG, ringBufferSize: 100 });
}

describe("downloadModel", () => {
  it("skips download when model files already exist", async () => {
    const dataDir = makeTempDir();
    try {
      const model: ModelEntry = {
        name: "test-model",
        description: "Test",
        url: "https://example.com/test.onnx",
        extractDir: "test-model",
        sizeMb: 1,
        files: ["model.onnx", "config.txt"],
      };

      // Pre-create the expected files so isModelPresent returns true
      const modelDir = join(dataDir, "models", "test-model");
      mkdirSync(modelDir, { recursive: true });
      writeFileSync(join(modelDir, "model.onnx"), "fake-data");
      writeFileSync(join(modelDir, "config.txt"), "fake-config");

      const result = await downloadModel(model, dataDir, makeLogger());

      expect(result.name).toBe("test-model");
      expect(result.status).toBe("already_present");
      expect(result.error).toBeUndefined();
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("returns error result for invalid URL", async () => {
    const dataDir = makeTempDir();
    try {
      const model: ModelEntry = {
        name: "bad-model",
        description: "Bad URL model",
        url: "https://localhost:1/nonexistent-model.onnx",
        extractDir: "bad-model",
        sizeMb: 1,
        files: ["nonexistent-model.onnx"],
      };

      const result = await downloadModel(model, dataDir, makeLogger());

      expect(result.name).toBe("bad-model");
      expect(result.status).toBe("error");
      expect(result.error).toBeDefined();
      expect(typeof result.error).toBe("string");
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
