-- Add HearingRecording model for audio recordings and transcripts
CREATE TABLE "hearing_recordings" (
    "id" TEXT NOT NULL,
    "hearingId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'audio/webm',
    "durationSecs" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "transcript" TEXT,
    "transcriptGeneratedAt" TIMESTAMP(3),
    "transcriptProvider" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hearing_recordings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "hearing_recordings_hearingId_fkey" FOREIGN KEY ("hearingId") REFERENCES "hearings"("id") ON DELETE CASCADE,
    CONSTRAINT "hearing_recordings_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX "hearing_recordings_hearingId_idx" ON "hearing_recordings"("hearingId");
CREATE INDEX "hearing_recordings_status_idx" ON "hearing_recordings"("status");