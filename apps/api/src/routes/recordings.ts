import type { FastifyInstance } from "fastify";
import { prisma } from "@tpt-court/database";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { requireTenantScope } from "../middleware/tenantScope.js";
import { recordAuditLog } from "../lib/audit.js";
import { uploadFile } from "../lib/storage.js";
import { transcribeRecording, isSttConfigured, getSttProvider } from "../lib/transcription.js";
import { randomUUID } from "crypto";

export default async function recordingRoutes(app: FastifyInstance) {
  // ── List recordings for a hearing ────────────────────────────────────────
  app.get<{ Params: { caseId: string; hearingId: string } }>(
    "/cases/:caseId/hearings/:hearingId/recordings",
    { preHandler: [requireAuth, requireTenantScope] },
    async (request, reply) => {
      const { caseId, hearingId } = request.params;

      const caseRecord = await prisma.case.findUnique({
        where: { id: caseId },
        select: { courtId: true },
      });
      if (!caseRecord) {
        return reply.status(404).send({ error: "NOT_FOUND", message: "Case not found", statusCode: 404 });
      }
      const userCourtId = request.user.courtId;
      if (userCourtId && caseRecord.courtId !== userCourtId) {
        return reply.status(403).send({ error: "FORBIDDEN", message: "Access denied: case belongs to a different court", statusCode: 403 });
      }

      const hearing = await prisma.hearing.findFirst({
        where: { id: hearingId, caseId },
        select: { id: true },
      });
      if (!hearing) {
        return reply.status(404).send({ error: "NOT_FOUND", message: "Hearing not found", statusCode: 404 });
      }

      const recordings = await prisma.hearingRecording.findMany({
        where: { hearingId },
        select: {
          id: true,
          hearingId: true,
          uploadedById: true,
          filePath: true,
          fileSize: true,
          mimeType: true,
          durationSecs: true,
          status: true,
          transcript: true,
          transcriptGeneratedAt: true,
          transcriptProvider: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: "desc" },
      });

      return reply.send({ data: recordings });
    },
  );

  // ── Upload a recording for a hearing ─────────────────────────────────────
  app.post<{ Params: { caseId: string; hearingId: string } }>(
    "/cases/:caseId/hearings/:hearingId/recordings",
    { preHandler: [requireAuth, requireTenantScope, requireRole("ADMIN", "CLERK", "JUDGE")] },
    async (request, reply) => {
      const { caseId, hearingId } = request.params;

      const caseRecord = await prisma.case.findUnique({
        where: { id: caseId },
        select: { courtId: true },
      });
      if (!caseRecord) {
        return reply.status(404).send({ error: "NOT_FOUND", message: "Case not found", statusCode: 404 });
      }
      const userCourtId = request.user.courtId;
      if (userCourtId && caseRecord.courtId !== userCourtId) {
        return reply.status(403).send({ error: "FORBIDDEN", message: "Access denied: case belongs to a different court", statusCode: 403 });
      }

      const hearing = await prisma.hearing.findFirst({
        where: { id: hearingId, caseId },
        select: { id: true },
      });
      if (!hearing) {
        return reply.status(404).send({ error: "NOT_FOUND", message: "Hearing not found", statusCode: 404 });
      }

      let fileBuffer: Buffer | null = null;
      let originalFilename = "";
      let mimeType = "audio/webm";
      let transcribe = false;

      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === "field") {
          if (part.fieldname === "transcribe" && part.value === "true") {
            transcribe = true;
          }
        } else {
          originalFilename = part.filename || `recording-${Date.now()}.webm`;
          mimeType = part.mimetype || "audio/webm";
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBuffer));
          }
          fileBuffer = Buffer.concat(chunks);
        }
      }

      if (!fileBuffer || fileBuffer.length === 0) {
        return reply.status(400).send({
          error: "VALIDATION_ERROR",
          message: "No audio file provided in the upload.",
          statusCode: 400,
        });
      }

      if (fileBuffer.length > 200 * 1024 * 1024) {
        return reply.status(400).send({
          error: "VALIDATION_ERROR",
          message: "Recording exceeds maximum file size of 200MB.",
          statusCode: 400,
        });
      }

      const ext = originalFilename.includes(".") ? originalFilename.split(".").pop() : "webm";
      const key = `recordings/${caseId}/${hearingId}/${randomUUID()}.${ext}`;
      const uploaded = await uploadFile(key, fileBuffer, mimeType);

      const recording = await prisma.hearingRecording.create({
        data: {
          hearingId,
          uploadedById: request.user.id,
          filePath: uploaded.url,
          fileSize: uploaded.size,
          mimeType,
          status: transcribe ? "PROCESSING" : "UPLOADED",
        },
      });

      await recordAuditLog({
        prisma,
        actor: { id: request.user.id, role: request.user.role },
        courtId: caseRecord.courtId ?? null,
        entityType: "HEARING_RECORDING",
        entityId: recording.id,
        action: "RECORDING_UPLOADED",
        fromState: null,
        toState: recording.status,
        changes: { fileSize: recording.fileSize, mimeType: recording.mimeType, transcribeRequested: transcribe },
      });

      if (transcribe) {
        transcribeInBackground(recording.id, key, mimeType, caseRecord.courtId, request.user.id, request.user.role).catch((err) => {
          app.log.error({ err, recordingId: recording.id }, "Background transcription failed");
        });
      }

      return reply.status(201).send({ data: recording });
    },
  );

  // ── Get single recording ─────────────────────────────────────────────────
  app.get<{ Params: { caseId: string; hearingId: string; id: string } }>(
    "/cases/:caseId/hearings/:hearingId/recordings/:id",
    { preHandler: [requireAuth, requireTenantScope] },
    async (request, reply) => {
      const { caseId, hearingId, id } = request.params;

      const recording = await prisma.hearingRecording.findFirst({
        where: { id, hearingId },
        include: { hearing: { select: { caseId: true } } },
      });

      if (!recording || recording.hearing.caseId !== caseId) {
        return reply.status(404).send({ error: "NOT_FOUND", message: "Recording not found", statusCode: 404 });
      }

      const caseRecord = await prisma.case.findUnique({
        where: { id: caseId },
        select: { courtId: true },
      });
      const userCourtId = request.user.courtId;
      if (userCourtId && caseRecord && caseRecord.courtId !== userCourtId) {
        return reply.status(403).send({ error: "FORBIDDEN", message: "Access denied: case belongs to a different court", statusCode: 403 });
      }

      return reply.send({ data: recording });
    },
  );

  // ── Delete recording ────────────────────────────────────────────────────
  app.delete<{ Params: { caseId: string; hearingId: string; id: string } }>(
    "/cases/:caseId/hearings/:hearingId/recordings/:id",
    { preHandler: [requireAuth, requireTenantScope, requireRole("ADMIN", "CLERK")] },
    async (request, reply) => {
      const { caseId, hearingId, id } = request.params;

      const recording = await prisma.hearingRecording.findFirst({
        where: { id, hearingId },
        include: { hearing: { select: { caseId: true } } },
      });

      if (!recording || recording.hearing.caseId !== caseId) {
        return reply.status(404).send({ error: "NOT_FOUND", message: "Recording not found", statusCode: 404 });
      }

      const caseRecord = await prisma.case.findUnique({
        where: { id: caseId },
        select: { courtId: true },
      });
      const userCourtId = request.user.courtId;
      if (userCourtId && caseRecord && caseRecord.courtId !== userCourtId) {
        return reply.status(403).send({ error: "FORBIDDEN", message: "Access denied: case belongs to a different court", statusCode: 403 });
      }

      await prisma.hearingRecording.delete({ where: { id } });

      await recordAuditLog({
        prisma,
        actor: { id: request.user.id, role: request.user.role },
        courtId: caseRecord?.courtId ?? null,
        entityType: "HEARING_RECORDING",
        entityId: id,
        action: "RECORDING_DELETED",
        fromState: recording.status,
        toState: null,
        changes: { filePath: recording.filePath, fileSize: recording.fileSize },
      });

      return reply.status(204).send();
    },
  );

  // ── Request transcription for an existing recording ──────────────────────
  app.post<{ Params: { caseId: string; hearingId: string; id: string } }>(
    "/cases/:caseId/hearings/:hearingId/recordings/:id/transcribe",
    { preHandler: [requireAuth, requireTenantScope, requireRole("ADMIN", "CLERK", "JUDGE")] },
    async (request, reply) => {
      const { caseId, hearingId, id } = request.params;

      if (!isSttConfigured()) {
        return reply.status(503).send({
          error: "NOT_CONFIGURED",
          message: "STT transcription is not configured. Set WHISPER_API_KEY or STT_PROVIDER=local + LOCAL_STT_URL.",
          statusCode: 503,
        });
      }

      const recording = await prisma.hearingRecording.findFirst({
        where: { id, hearingId },
        include: { hearing: { select: { caseId: true } } },
      });

      if (!recording || recording.hearing.caseId !== caseId) {
        return reply.status(404).send({ error: "NOT_FOUND", message: "Recording not found", statusCode: 404 });
      }

      const caseRecord = await prisma.case.findUnique({
        where: { id: caseId },
        select: { courtId: true },
      });
      const userCourtId = request.user.courtId;
      if (userCourtId && caseRecord && caseRecord.courtId !== userCourtId) {
        return reply.status(403).send({ error: "FORBIDDEN", message: "Access denied: case belongs to a different court", statusCode: 403 });
      }

      await prisma.hearingRecording.update({
        where: { id },
        data: { status: "PROCESSING" },
      });

      const storageKey = recording.filePath.replace("/uploads/", "");
      transcribeInBackground(
        recording.id,
        storageKey,
        recording.mimeType,
        caseRecord?.courtId ?? null,
        request.user.id,
        request.user.role,
      ).catch((err) => {
        app.log.error({ err, recordingId: recording.id }, "Background transcription failed");
      });

      return reply.send({ data: { id: recording.id, status: "PROCESSING" } });
    },
  );

  // ── Check STT configuration status ───────────────────────────────────────
  app.get(
    "/stt/config",
    { preHandler: [requireAuth] },
    async (_request, reply) => {
      return reply.send({
        data: {
          configured: isSttConfigured(),
          provider: getSttProvider(),
        },
      });
    },
  );
}

// ── Background transcription helper ─────────────────────────────────────────

async function transcribeInBackground(
  recordingId: string,
  fileKey: string,
  mimeType: string,
  courtId: string | null,
  userId: string,
  userRole: string,
): Promise<void> {
  try {
    const transcript = await transcribeRecording(fileKey, mimeType);

    await prisma.hearingRecording.update({
      where: { id: recordingId },
      data: {
        status: "TRANSCRIBED",
        transcript,
        transcriptGeneratedAt: new Date(),
        transcriptProvider: getSttProvider(),
      },
    });

    await recordAuditLog({
      prisma,
      actor: { id: userId, role: userRole },
      courtId,
      entityType: "HEARING_RECORDING",
      entityId: recordingId,
      action: "RECORDING_TRANSCRIBED",
      fromState: "PROCESSING",
      toState: "TRANSCRIBED",
      changes: { transcriptLength: transcript.length, provider: getSttProvider() },
    });
  } catch (err) {
    await prisma.hearingRecording.update({
      where: { id: recordingId },
      data: { status: "FAILED" },
    }).catch(() => { /* ignore */ });
    throw err;
  }
}