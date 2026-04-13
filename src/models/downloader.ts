import { createWriteStream, mkdirSync, renameSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { Readable } from "node:stream";
import type { Logger } from "../logging/logger.js";
import type { ModelEntry } from "./registry.js";
import { isModelPresent, getModelPath } from "./registry.js";

const execAsync = promisify(exec);

export interface DownloadResult {
  name: string;
  status: "downloaded" | "already_present" | "error";
  error?: string;
}

export async function downloadModel(
  model: ModelEntry,
  dataDir: string,
  logger: Logger,
): Promise<DownloadResult> {
  const log = logger.scope("models:download");
  const modelDir = getModelPath(dataDir, model.name);

  if (isModelPresent(dataDir, model)) {
    log.info(`Model ${model.name} already present, skipping download`);
    return { name: model.name, status: "already_present" };
  }

  mkdirSync(modelDir, { recursive: true });

  const url = model.url;
  const isArchive = url.endsWith(".tar.bz2");

  try {
    log.info(`Downloading ${model.name} from ${url}`);
    const response = await fetch(url);

    if (!response.ok) {
      const msg = `HTTP ${response.status} ${response.statusText}`;
      log.error(`Download failed for ${model.name}: ${msg}`);
      return { name: model.name, status: "error", error: msg };
    }

    if (!response.body) {
      const msg = "Response body is null";
      log.error(`Download failed for ${model.name}: ${msg}`);
      return { name: model.name, status: "error", error: msg };
    }

    if (isArchive) {
      const tmpPath = join(modelDir, `${model.name}.tar.bz2.tmp`);

      log.info(`Writing archive to ${tmpPath}`);
      const nodeStream = Readable.fromWeb(response.body as import("stream/web").ReadableStream);
      await pipeline(nodeStream, createWriteStream(tmpPath));

      log.info(`Extracting archive for ${model.name}`);
      await execAsync(`tar -xf "${tmpPath}" --strip-components=1 -C "${modelDir}"`);

      unlinkSync(tmpPath);
      log.info(`Extracted and cleaned up archive for ${model.name}`);
    } else {
      // Single .onnx file
      const fileName = url.split("/").pop()!;
      const finalPath = join(modelDir, fileName);
      const tmpPath = `${finalPath}.tmp`;

      log.info(`Writing ${fileName} to ${tmpPath}`);
      const nodeStream = Readable.fromWeb(response.body as import("stream/web").ReadableStream);
      await pipeline(nodeStream, createWriteStream(tmpPath));

      renameSync(tmpPath, finalPath);
      log.info(`Renamed tmp to final: ${finalPath}`);
    }

    log.info(`Successfully downloaded ${model.name}`);
    return { name: model.name, status: "downloaded" };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`Error downloading ${model.name}: ${message}`);
    return { name: model.name, status: "error", error: message };
  }
}

export interface DownloadAllResult {
  downloaded: string[];
  already_present: string[];
  errors: string[];
}

export async function downloadAllMissing(
  dataDir: string,
  missingModels: ModelEntry[],
  logger: Logger,
): Promise<DownloadAllResult> {
  const log = logger.scope("models:download");
  const result: DownloadAllResult = {
    downloaded: [],
    already_present: [],
    errors: [],
  };

  log.info(`Downloading ${missingModels.length} missing model(s)`);

  for (const model of missingModels) {
    const downloadResult = await downloadModel(model, dataDir, logger);
    switch (downloadResult.status) {
      case "downloaded":
        result.downloaded.push(downloadResult.name);
        break;
      case "already_present":
        result.already_present.push(downloadResult.name);
        break;
      case "error":
        result.errors.push(`${downloadResult.name}: ${downloadResult.error}`);
        break;
    }
  }

  log.info(
    `Download complete: ${result.downloaded.length} downloaded, ${result.already_present.length} present, ${result.errors.length} errors`,
  );

  return result;
}
