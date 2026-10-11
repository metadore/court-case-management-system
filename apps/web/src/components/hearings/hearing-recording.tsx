"use client";

import { useState, useRef, useCallback } from "react";
import { api } from "@/lib/api";
import { Badge, Button, Card } from "@tpt-court/ui";
import type { HearingRecordingItem } from "@tpt-court/types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(secs: number | null): string {
  if (!secs) return "Unknown";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function statusBadgeVariant(status: string): "success" | "warning" | "destructive" | "default" {
  switch (status) {
    case "TRANSCRIBED": return "success";
    case "PROCESSING": return "warning";
    case "FAILED": return "destructive";
    default: return "default";
  }
}

// ── Constants for MediaRecorder ──────────────────────────────────────────────

const MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];

function getSupportedMimeType(): string {
  return MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? "audio/webm";
}

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  caseId: string;
  hearingId: string;
  recordings: HearingRecordingItem[];
  onRecordingsChange: () => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function HearingRecordingSection({ caseId, hearingId, recordings, onRecordingsChange }: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [transcribingId, setTranscribingId] = useState<string | null>(null);
  const [sttConfig, setSttConfig] = useState<{ configured: boolean; provider: string } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Load STT config once on mount
  const configFetched = useRef(false);
  if (!configFetched.current) {
    configFetched.current = true;
    api.get<{ data: { configured: boolean; provider: string } }>("/stt/config")
      .then((res) => setSttConfig(res.data))
      .catch(() => setSttConfig({ configured: false, provider: "unknown" }));
  }

  // ── Start recording ─────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedMimeType();
      const recorder = new MediaRecorder(stream, { mimeType });

      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        // Stop all tracks
        stream.getTracks().forEach((t) => t.stop());

        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size === 0) return;

        setIsUploading(true);
        try {
          const formData = new FormData();
          formData.append("audio", blob, `recording-${Date.now()}.webm`);
          formData.append("transcribe", sttConfig?.configured ? "true" : "false");

          await api.upload(`/cases/${caseId}/hearings/${hearingId}/recordings`, formData);

          onRecordingsChange();
        } catch (err) {
          console.error("Upload failed:", err);
        } finally {
          setIsUploading(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Failed to start recording:", err);
      alert("Could not access microphone. Please ensure microphone permissions are granted.");
    }
  }, [caseId, hearingId, onRecordingsChange, sttConfig]);

  // ── Stop recording ──────────────────────────────────────────────────────
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  // ── Request transcription ───────────────────────────────────────────────
  const requestTranscription = useCallback(async (recordingId: string) => {
    setTranscribingId(recordingId);
    try {
      await api.post(`/cases/${caseId}/hearings/${hearingId}/recordings/${recordingId}/transcribe`);
      onRecordingsChange();
    } catch (err) {
      console.error("Transcription request failed:", err);
    } finally {
      setTranscribingId(null);
    }
  }, [caseId, hearingId, onRecordingsChange]);

  // ── Delete recording ────────────────────────────────────────────────────
  const deleteRecording = useCallback(async (recordingId: string) => {
    if (!confirm("Delete this recording and its transcript?")) return;
    try {
      await api.delete(`/cases/${caseId}/hearings/${hearingId}/recordings/${recordingId}`);
      onRecordingsChange();
    } catch (err) {
      console.error("Delete failed:", err);
    }
  }, [caseId, hearingId, onRecordingsChange]);

  return (
    <Card className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Recordings & Transcripts</h3>
        <div className="flex items-center gap-2">
          {sttConfig && (
            <span className="text-xs text-gray-500">
              STT: {sttConfig.configured ? sttConfig.provider : "Not configured"}
            </span>
          )}
          {!isRecording ? (
            <Button onClick={startRecording} disabled={isUploading} size="sm">
              {isUploading ? "Uploading..." : "Start Recording"}
            </Button>
          ) : (
            <Button onClick={stopRecording} variant="destructive" size="sm">
              Stop Recording
            </Button>
          )}
        </div>
      </div>

      {isRecording && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <span className="h-3 w-3 animate-pulse rounded-full bg-red-500" />
          Recording in progress... Click "Stop Recording" when finished.
        </div>
      )}

      {recordings.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-500">
          No recordings yet. Click "Start Recording" to begin.
        </p>
      ) : (
        <div className="space-y-3">
          {recordings.map((rec) => (
            <div key={rec.id} className="rounded-lg border bg-gray-50 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">
                    {new Date(rec.createdAt).toLocaleString()}
                  </span>
                  <Badge variant={statusBadgeVariant(rec.status)}>{rec.status}</Badge>
                  {rec.durationSecs && (
                    <span className="text-xs text-gray-500">{formatDuration(rec.durationSecs)}</span>
                  )}
                  <span className="text-xs text-gray-400">{formatFileSize(rec.fileSize)}</span>
                </div>
                <div className="flex items-center gap-2">
                  {rec.status === "UPLOADED" && sttConfig?.configured && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => requestTranscription(rec.id)}
                      disabled={transcribingId === rec.id}
                    >
                      {transcribingId === rec.id ? "Transcribing..." : "Transcribe"}
                    </Button>
                  )}
                  {rec.status === "FAILED" && sttConfig?.configured && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => requestTranscription(rec.id)}
                      disabled={transcribingId === rec.id}
                    >
                      Retry
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => deleteRecording(rec.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>

              {rec.status === "PROCESSING" && (
                <div className="mt-2 flex items-center gap-2 text-sm text-yellow-600">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-500" />
                  Transcription in progress...
                </div>
              )}

              {rec.transcript && (
                <div className="mt-3">
                  <details className="group">
                    <summary className="cursor-pointer text-sm font-medium text-blue-600 hover:text-blue-800">
                      View Transcript
                      {rec.transcriptProvider && (
                        <span className="ml-2 text-xs text-gray-400">
                          (via {rec.transcriptProvider})
                        </span>
                      )}
                    </summary>
                    <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border bg-white p-3 text-sm text-gray-700 whitespace-pre-wrap">
                      {rec.transcript}
                    </div>
                  </details>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}