// ── Speech-to-Text transcription service ──────────────────────────────────
//
// Provides an abstraction over multiple STT providers:
//   - OpenAI Whisper API (default)
//   - Local Whisper (Ollama-compatible or local model)
//   - Anthropic (falls through to no-op; not suitable for STT directly)

import { getFileBuffer } from "./storage.js";

// ── Configuration ──────────────────────────────────────────────────────────

const STT_PROVIDER = process.env["STT_PROVIDER"] ?? "whisper"; // "whisper" | "local"
const WHISPER_API_KEY = process.env["WHISPER_API_KEY"] ?? "";
const LOCAL_STT_URL = process.env["LOCAL_STT_URL"] ?? "http://localhost:11434";
const LOCAL_STT_MODEL = process.env["LOCAL_STT_MODEL"] ?? "whisper";

// ── Provider check ─────────────────────────────────────────────────────────

export function isSttConfigured(): boolean {
  if (STT_PROVIDER === "local") return true;
  return Boolean(WHISPER_API_KEY);
}

export function getSttProvider(): string {
  return STT_PROVIDER;
}

// ── OpenAI Whisper API ─────────────────────────────────────────────────────

async function transcribeWhisper(audioBuffer: Buffer, mimeType: string): Promise<string> {
  const formData = new FormData();
  const blob = new Blob([audioBuffer], { type: mimeType });
  const extension = mimeTypeToExtension(mimeType);
  formData.append("file", blob, `recording.${extension}`);
  formData.append("model", "whisper-1");
  formData.append("response_format", "text");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHISPER_API_KEY}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Whisper API error ${res.status}: ${errorText}`);
  }

  return await res.text();
}

// ── Local Whisper (Ollama-compatible) ──────────────────────────────────────

async function transcribeLocal(audioBuffer: Buffer, _mimeType: string): Promise<string> {
  // Convert audio to base64 for the local API
  const base64Audio = audioBuffer.toString("base64");

  const res = await fetch(`${LOCAL_STT_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: LOCAL_STT_MODEL,
      messages: [
        {
          role: "user",
          content: `Transcribe this audio recording of a court hearing precisely. Include speaker changes if discernible. Audio (base64): ${base64Audio.substring(0, 10000)}`,
        },
      ],
      stream: false,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Local STT error ${res.status}: ${errorText}`);
  }

  const json = (await res.json()) as { message?: { content?: string } };
  return json.message?.content ?? "";
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Transcribe an audio recording file.
 * @param fileKey - The storage key of the uploaded audio file
 * @returns The transcribed text
 */
export async function transcribeRecording(fileKey: string, mimeType: string): Promise<string> {
  const audioBuffer = await getFileBuffer(fileKey);
  if (!audioBuffer || audioBuffer.length === 0) {
    throw new Error("Audio file not found or empty");
  }

  if (STT_PROVIDER === "local") {
    return transcribeLocal(audioBuffer, mimeType);
  }

  return transcribeWhisper(audioBuffer, mimeType);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function mimeTypeToExtension(mime: string): string {
  const map: Record<string, string> = {
    "audio/webm": "webm",
    "audio/wav": "wav",
    "audio/mpeg": "mp3",
    "audio/mp4": "mp4",
    "audio/ogg": "ogg",
    "audio/flac": "flac",
    "audio/x-wav": "wav",
    "audio/x-m4a": "m4a",
  };
  return map[mime] ?? "webm";
}