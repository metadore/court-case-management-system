import type { FastifyInstance } from "fastify";
import { prisma } from "@tpt-court/database";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { requireTenantScope } from "../middleware/tenantScope.js";
import { z } from "zod";
import { recordAuditLog } from "../lib/audit.js";
import { dispatchCaseEvent } from "../notifications/dispatch.js";
import { uploadFile } from "../lib/storage.js";
import { randomUUID } from "crypto";

export default async function documentRoutes(app: FastifyInstance) {
  // ── List documents for a case ──────────────────────────────────────────
  app.get<{ Params: { caseId: string } }>("/cases/:caseId/documents", { preHandler: [requireAuth, requireTenantScope] }, async (request, reply) => {
    const { caseId } = request.params;

    const user = request.user;

    // C1 fix: enforce tenant scoping
    const caseRecord = await prisma.case.findUnique({ where: { id: caseId }, select: { courtId: true } });
    if (!caseRecord) {
      return reply.status(404).send({ error: "NOT_FOUND", message: "Case not found", statusCode: 404 });
    }
    const userCourtId = request.user.courtId;
    if (userCourtId && caseRecord.courtId !== userCourtId) {
      return reply.status(403).send({ error: "FORBIDDEN", message: "Access denied: case belongs to a different court", statusCode: 403 });
    }

    if (user.role === "PUBLIC" || user.role === "LAWYER") {
      const party = await prisma.party.findFirst({
        where: { caseId, userId: user.id },
      });

      if (!party) {
        return reply.status(403).send({ error: "FORBIDDEN", message: "Not a party to this case", statusCode: 403 });
      }

      const docs = await prisma.document.findMany({
        where: { caseId, confidentiality: "PUBLIC" },
        select: {
          id: true,
          title: true,
          type: true,
          fileSize: true,
          mimeType: true,
          confidentiality: true,
          version: true,
          createdAt: true,
          uploadedBy: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      return reply.send({ data: docs });
    }

    const docs = await prisma.document.findMany({
      where: { caseId },
      select: {
        id: true,
        title: true,
        type: true,
        filePath: true,
        fileSize: true,
        mimeType: true,
        confidentiality: true,
        version: true,
        createdAt: true,
        uploadedBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return reply.send({ data: docs });
  });

  // ── Upload document ────────────────────────────────────────────────────
  app.post<{ Params: { caseId: string } }>("/cases/:caseId/documents", { preHandler: [requireAuth, requireTenantScope, requireRole("ADMIN", "CLERK", "JUDGE", "LAWYER")] }, async (request, reply) => {
    const { caseId } = request.params;

    // C1 fix: enforce tenant scoping
    const caseRecord = await prisma.case.findUnique({ where: { id: caseId }, select: { courtId: true } });
    if (!caseRecord) {
      return reply.status(404).send({ error: "NOT_FOUND", message: "Case not found", statusCode: 404 });
    }
    const userCourtId = request.user.courtId;
    if (userCourtId && caseRecord.courtId !== userCourtId) {
      return reply.status(403).send({ error: "FORBIDDEN", message: "Access denied: case belongs to a different court", statusCode: 403 });
    }

    // Parse multipart form: fields + optional file
    const fields: Record<string, string> = {};
    let fileBuffer: Buffer | null = null;
    let originalFilename = "";
    let mimeType = "application/octet-stream";

    const parts = request.parts();
    for await (const part of parts) {
      if (part.type === "field") {
        fields[part.fieldname] = part.value as string;
      } else {
        originalFilename = part.filename;
        mimeType = part.mimetype;
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBuffer));
        }
        fileBuffer = Buffer.concat(chunks);
      }
    }

    const fieldSchema = z.object({
      title: z.string().min(1).max(255),
      type: z.enum(["COMPLAINT", "MOTION", "RESPONSE", "ORDER", "JUDGMENT", "NOTICE", "AFFIDAVIT", "EVIDENCE", "TRANSCRIPT", "OTHER"]),
      confidentiality: z.enum(["PUBLIC", "RESTRICTED", "SEALED", "CONFIDENTIAL"]).default("PUBLIC"),
    });

    const parsed = fieldSchema.safeParse(fields);
    if (!parsed.success) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: parsed.error.message, statusCode: 400 });
    }

    // Verify lawyer is a party to this case
    if (request.user.role === "LAWYER") {
      const party = await prisma.party.findFirst({
        where: { caseId, userId: request.user.id },
      });
      if (!party) {
        return reply.status(403).send({ error: "FORBIDDEN", message: "Not a party to this case", statusCode: 403 });
      }
    }

    // Save file to storage if provided
    let filePath = "";
    let fileSize = 0;
    if (fileBuffer && fileBuffer.length > 0) {
      // Whitelist of permitted MIME types — reject anything outside this set
      const ALLOWED_MIME_TYPES: Record<string, string> = {
        "application/pdf": "pdf",
        "application/msword": "doc",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
        "application/vnd.ms-excel": "xls",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/tiff": "tiff",
        "text/plain": "txt",
      };

      const allowedExt = ALLOWED_MIME_TYPES[mimeType];
      if (!allowedExt) {
        return reply.status(415).send({
          error: "UNSUPPORTED_MEDIA_TYPE",
          message: `File type '${mimeType}' is not permitted. Allowed types: PDF, DOC, DOCX, XLS, XLSX, PNG, JPEG, TIFF, TXT.`,
          statusCode: 415,
        });
      }

      const key = `cases/${caseId}/${randomUUID()}.${allowedExt}`;
      const uploaded = await uploadFile(key, fileBuffer, mimeType);
      filePath = uploaded.url;
      fileSize = uploaded.size;
    }

    const doc = await prisma.document.create({
      data: {
        caseId,
        title: parsed.data.title,
        type: parsed.data.type,
        confidentiality: parsed.data.confidentiality,
        filePath,
        mimeType,
        fileSize,
        uploadedById: request.user.id,
      },
    });

    const courtRecord = await prisma.case.findUnique({ where: { id: caseId }, select: { courtId: true } });
    await recordAuditLog({
      prisma,
      actor: { id: request.user.id, role: request.user.role },
      courtId: courtRecord?.courtId ?? null,
      entityType: "DOCUMENT",
      entityId: doc.id,
      action: "DOCUMENT_UPLOADED",
      fromState: null,
      toState: null,
      changes: { title: doc.title, type: doc.type, confidentiality: doc.confidentiality, version: doc.version, hasFile: fileSize > 0 },
    });

    dispatchCaseEvent(caseId, "DOCUMENT_FILED", {
      documentTitle: doc.title,
      documentType: doc.type,
    }).catch(() => {/* non-blocking */});

    return reply.status(201).send({ data: doc });
  });

  // ── Document version history ───────────────────────────────────────────
  app.get<{ Params: { caseId: string; id: string } }>("/cases/:caseId/documents/:id/versions", { preHandler: [requireAuth, requireTenantScope] }, async (request, reply) => {
    const { caseId, id } = request.params;

    const doc = await prisma.document.findFirst({
      where: { id, caseId },
      select: {
        id: true,
        title: true,
        version: true,
        parentDocId: true,
        filePath: true,
        fileSize: true,
        mimeType: true,
        createdAt: true,
        uploadedBy: { select: { firstName: true, lastName: true } },
        versions: {
          select: {
            id: true,
            title: true,
            version: true,
            filePath: true,
            fileSize: true,
            mimeType: true,
            createdAt: true,
            uploadedBy: { select: { firstName: true, lastName: true } },
          },
          orderBy: { version: "asc" },
        },
      },
    });

    if (!doc) return reply.code(404).send({ error: "Document not found" });

    // Assemble full version chain: root doc + its children
    const allVersions = [
      { id: doc.id, title: doc.title, version: doc.version, filePath: doc.filePath, fileSize: doc.fileSize, mimeType: doc.mimeType, createdAt: doc.createdAt, uploadedBy: doc.uploadedBy },
      ...doc.versions,
    ].sort((a, b) => a.version - b.version);

    return reply.send({ data: allVersions });
  });

  // ── Get single document ────────────────────────────────────────────────
  app.get<{ Params: { caseId: string; id: string } }>("/cases/:caseId/documents/:id", { preHandler: [requireAuth, requireTenantScope] }, async (request, reply) => {
    const { caseId, id } = request.params;

    const document = await prisma.document.findFirst({
      where: { id, caseId },
      include: { case: { select: { courtId: true } } },
    });

    if (!document) {
      return reply.status(404).send({ error: "NOT_FOUND", message: "Document not found", statusCode: 404 });
    }

    // C1 fix: enforce tenant scoping
    const userCourtId = request.user.courtId;
    if (userCourtId && document.case.courtId !== userCourtId) {
      return reply.status(403).send({ error: "FORBIDDEN", message: "Access denied: document belongs to a different court", statusCode: 403 });
    }

    const isStaffRole = request.user.role === "ADMIN" || request.user.role === "CLERK" || request.user.role === "JUDGE";

    // SEALED and CONFIDENTIAL are staff-only
    if (!isStaffRole && (document.confidentiality === "SEALED" || document.confidentiality === "CONFIDENTIAL")) {
      return reply.status(403).send({ error: "FORBIDDEN", message: "Access denied: document is restricted", statusCode: 403 });
    }

    // PUBLIC role can only access PUBLIC documents
    if (request.user.role === "PUBLIC" && document.confidentiality !== "PUBLIC") {
      return reply.status(403).send({ error: "FORBIDDEN", message: "Document is not public", statusCode: 403 });
    }

    // LAWYER role must be a party to the case to access RESTRICTED documents
    if (request.user.role === "LAWYER" && document.confidentiality !== "PUBLIC") {
      const party = await prisma.party.findFirst({
        where: { caseId, userId: request.user.id },
      });
      if (!party) {
        return reply.status(403).send({ error: "FORBIDDEN", message: "Not a party to this case", statusCode: 403 });
      }
    }

    return reply.send({ data: document });
  });
}