import {
  S3Client,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  NotFound,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import fsp from "fs/promises";
import path from "path";
import { createReadStream } from "fs";
import { Readable } from "stream";

// ── Configuration ──────────────────────────────────────────────────────────

const UPLOADS_DIR = process.env["UPLOADS_DIR"] ?? "./uploads";

const STORAGE_ENDPOINT = process.env["STORAGE_ENDPOINT"] ?? "";
const STORAGE_REGION = process.env["STORAGE_REGION"] ?? "us-east-1";
const STORAGE_BUCKET = process.env["STORAGE_BUCKET"] ?? "tpt-court-documents";
const STORAGE_ACCESS_KEY = process.env["STORAGE_ACCESS_KEY"] ?? "";
const STORAGE_SECRET_KEY = process.env["STORAGE_SECRET_KEY"] ?? "";
const STORAGE_FORCE_PATH_STYLE = process.env["STORAGE_FORCE_PATH_STYLE"] === "true";

/** Whether S3-compatible storage is configured */
export const USE_S3 = Boolean(STORAGE_ENDPOINT && STORAGE_ACCESS_KEY && STORAGE_SECRET_KEY);

// ── S3 Client (lazy init) ──────────────────────────────────────────────────

let _s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!_s3Client) {
    _s3Client = new S3Client({
      endpoint: STORAGE_ENDPOINT,
      region: STORAGE_REGION,
      credentials: {
        accessKeyId: STORAGE_ACCESS_KEY,
        secretAccessKey: STORAGE_SECRET_KEY,
      },
      forcePathStyle: STORAGE_FORCE_PATH_STYLE,
    });
  }
  return _s3Client;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getLocalPath(key: string): string {
  // M8 fix: More robust path traversal sanitization
  // Normalize path separators first
  let sanitized = key.replace(/\\/g, "/");

  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, "");

  // Recursively remove path traversal sequences
  while (sanitized.includes("../") || sanitized.includes("..%2f") || sanitized.includes("..%2F")) {
    sanitized = sanitized.replace(/\.\.\//g, "").replace(/\.\.%2f/g, "").replace(/\.\.%2F/g, "");
  }

  // Remove leading slashes
  sanitized = sanitized.replace(/^\/+/, "");

  // Resolve the path and verify it stays within UPLOADS_DIR
  const resolved = path.resolve(UPLOADS_DIR, sanitized);
  const uploadsDirResolved = path.resolve(UPLOADS_DIR);

  // Ensure the resolved path is within UPLOADS_DIR
  if (!resolved.startsWith(uploadsDirResolved + path.sep) && resolved !== uploadsDirResolved) {
    throw new Error("Invalid file path: directory traversal detected");
  }

  return resolved;
}

async function ensureLocalDir(key: string): Promise<void> {
  const dir = path.dirname(getLocalPath(key));
  await fsp.mkdir(dir, { recursive: true });
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface UploadResult {
  key: string;
  bucket: string;
  url: string;
  size: number;
  storage: "s3" | "local";
}

export interface FileInfo {
  key: string;
  size: number;
  lastModified: Date;
}

/**
 * Upload a file buffer / stream to storage.
 *
 * When S3 is configured, it uploads to the S3-compatible endpoint.
 * Otherwise it saves to the local UPLOADS_DIR.
 */
export async function uploadFile(
  key: string,
  body: Buffer | Readable | Uint8Array | string,
  mimeType: string = "application/octet-stream",
): Promise<UploadResult> {
  const bucket = STORAGE_BUCKET;

  if (USE_S3) {
    const client = getS3Client();
    const passThrough = body instanceof Readable ? body : Readable.from([body instanceof Buffer || body instanceof Uint8Array ? body : Buffer.from(body)]);

    const upload = new Upload({
      client,
      params: {
        Bucket: bucket,
        Key: key,
        Body: passThrough,
        ContentType: mimeType,
      },
      queueSize: 4,
      partSize: 5 * 1024 * 1024,
    });

    await upload.done();

    return {
      key,
      bucket,
      url: `${STORAGE_ENDPOINT}/${bucket}/${key}`,
      size: body instanceof Buffer ? body.length : 0,
      storage: "s3",
    };
  }

  // Local filesystem fallback
  await ensureLocalDir(key);
  const localPath = getLocalPath(key);
  const buf = body instanceof Buffer ? body : Buffer.from(await streamToBuffer(body instanceof Readable ? body : Readable.from([body])));

  await fsp.writeFile(localPath, buf);

  return {
    key,
    bucket: "local",
    url: `/uploads/${key}`,
    size: buf.length,
    storage: "local",
  };
}

/**
 * Get a readable stream of a stored file.
 */
export async function getFileStream(key: string): Promise<Readable | null> {
  if (USE_S3) {
    try {
      const client = getS3Client();
      const command = new GetObjectCommand({ Bucket: STORAGE_BUCKET, Key: key });
      const response = await client.send(command);
      return response.Body as Readable;
    } catch (error) {
      if (error instanceof NotFound) return null;
      throw error;
    }
  }

  // Local filesystem fallback
  const localPath = getLocalPath(key);
  try {
    await fsp.access(localPath);
    return createReadStream(localPath);
  } catch {
    return null;
  }
}

/**
 * Get file metadata.
 */
export async function getFileInfo(key: string): Promise<FileInfo | null> {
  if (USE_S3) {
    try {
      const client = getS3Client();
      const command = new GetObjectCommand({ Bucket: STORAGE_BUCKET, Key: key });
      const response = await client.send(command);
      return {
        key,
        size: response.ContentLength ?? 0,
        lastModified: response.LastModified ?? new Date(),
      };
    } catch (error) {
      if (error instanceof NotFound) return null;
      throw error;
    }
  }

  // Local filesystem fallback
  const localPath = getLocalPath(key);
  try {
    const stat = await fsp.stat(localPath);
    return { key, size: stat.size, lastModified: stat.mtime };
  } catch {
    return null;
  }
}

/**
 * Delete a stored file.
 */
export async function deleteFile(key: string): Promise<boolean> {
  if (USE_S3) {
    try {
      const client = getS3Client();
      const command = new DeleteObjectCommand({ Bucket: STORAGE_BUCKET, Key: key });
      await client.send(command);
      return true;
    } catch (error) {
      if (error instanceof NotFound) return false;
      throw error;
    }
  }

  // Local filesystem fallback
  const localPath = getLocalPath(key);
  try {
    await fsp.unlink(localPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * List all files with a given prefix.
 */
export async function listFiles(prefix: string = ""): Promise<FileInfo[]> {
  if (USE_S3) {
    const client = getS3Client();
    const command = new ListObjectsV2Command({ Bucket: STORAGE_BUCKET, Prefix: prefix });
    const response = await client.send(command);
    return (response.Contents ?? []).map((obj) => ({
      key: obj.Key ?? "",
      size: obj.Size ?? 0,
      lastModified: obj.LastModified ?? new Date(),
    }));
  }

  // Local filesystem fallback
  const dir = path.join(UPLOADS_DIR, prefix);
  try {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    const files: FileInfo[] = [];
    for (const entry of entries) {
      if (entry.isFile()) {
        const stat = await fsp.stat(path.join(dir, entry.name));
        files.push({ key: path.join(prefix, entry.name), size: stat.size, lastModified: stat.mtime });
      }
    }
    return files;
  } catch {
    return [];
  }
}

/**
 * Get a file as a Buffer (for small files / downloads).
 */
export async function getFileBuffer(key: string): Promise<Buffer | null> {
  const stream = await getFileStream(key);
  if (!stream) return null;
  return streamToBuffer(stream);
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}