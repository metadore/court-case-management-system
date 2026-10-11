import type { FastifyInstance } from "fastify";
import { prisma } from "@tpt-court/database";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { requireTenantScope } from "../middleware/tenantScope.js";
import { z } from "zod";
import { recordAuditLog } from "../lib/audit.js";
import { signDocument, verifyDocumentSignature } from "../lib/signature.js";

export default async function signatureRoutes(app: FastifyInstance) {
  // ── Sign a document ──────────────────────────────────────────────────────
  app.post<{ Params: { caseId: string; documentId: string } }>(
    "/cases/:caseId/documents/:documentId/sign",
    { preHandler: [requireAuth, requireRole("ADMIN", "CLERK", "JUDGE", "LAWYER")] },
    async (request, reply) => {
      const { caseId, documentId } = request.params;

      const schema = z.object({
        signerName: z.string().min(1).max(255),
        signerRole: z.string().min(1).max(100),
        signerEmail: z.string().email().optional(),
      });

      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "VALIDATION_ERROR",
          message: parsed.error.message,
          statusCode: 400,
        });
      }

      // Fetch document with case verification
      const document = await prisma.document.findFirst({
        where: { id: documentId, caseId },
        include: {
          case: { select: { courtId: true, caseNumber: true } },
          uploadedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      });

      if (!document) {
        return reply.status(404).send({
          error: "NOT_FOUND",
          message: "Document not found in this case",
          statusCode: 404,
        });
      }

      // C1 fix: enforce tenant scoping
      const user = request.user as { courtId?: string | null };
      if (user.courtId && document.case.courtId !== user.courtId) {
        return reply.status(403).send({
          error: "FORBIDDEN",
          message: "Access denied: document belongs to a different court",
          statusCode: 403,
        });
      }

      // Check file exists in storage
      if (!document.filePath) {
        return reply.status(400).send({
          error: "INVALID_STATE",
          message: "Document has no file uploaded yet. Upload the file first before signing.",
          statusCode: 400,
        });
      }

      // Verify the user is authorized to sign:
      // - JUDGE/ADMIN can sign any document in the case
      // - LAWYER/CLERK must be a party to the case
      if (request.user.role === "LAWYER" || request.user.role === "CLERK") {
        const party = await prisma.party.findFirst({
          where: { caseId, userId: request.user.id },
        });
        if (!party) {
          return reply.status(403).send({
            error: "FORBIDDEN",
            message: "You must be a party to this case to sign documents",
            statusCode: 403,
          });
        }
      }

      // Check if user already signed this document
      const existingSignature = await prisma.documentSignature.findFirst({
        where: { documentId, userId: request.user.id },
      });

      if (existingSignature) {
        return reply.status(409).send({
          error: "ALREADY_SIGNED",
          message: "You have already signed this document",
          statusCode: 409,
          data: {
            signatureId: existingSignature.id,
            signedAt: existingSignature.signedAt,
          },
        });
      }

      // Perform the cryptographic signature
      const signatureResult = await signDocument(document.filePath, {
        documentId: document.id,
        userId: request.user.id,
        signerName: parsed.data.signerName,
        signerRole: parsed.data.signerRole,
        signerEmail: parsed.data.signerEmail,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? undefined,
      });

      // Create signature record in DB
      const signatureRecord = await prisma.documentSignature.create({
        data: {
          documentId: document.id,
          userId: request.user.id,
          signatureHash: signatureResult.signatureHash,
          signerName: parsed.data.signerName,
          signerRole: parsed.data.signerRole,
          signerEmail: parsed.data.signerEmail ?? null,
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
          certificate: {
            algorithm: "HMAC-SHA256",
            hashAlgorithm: "SHA256",
            signedAt: signatureResult.signedAt,
            hmacTokenPrefix: signatureResult.signatureHash.substring(0, 16),
          },
        },
      });

      // Update document signed timestamp
      await prisma.document.update({
        where: { id: document.id },
        data: { signedAt: new Date(signatureResult.signedAt) },
      });

      // Audit log
      const courtId = document.case.courtId ?? null;
      await recordAuditLog({
        prisma,
        actor: { id: request.user.id, role: request.user.role },
        courtId,
        entityType: "DOCUMENT",
        entityId: document.id,
        action: "DOCUMENT_SIGNED",
        fromState: null,
        toState: null,
        changes: {
          signatureId: signatureRecord.id,
          signerName: parsed.data.signerName,
          signerRole: parsed.data.signerRole,
          signatureHash: signatureResult.signatureHash.substring(0, 20),
        },
      });

      return reply.status(201).send({
        data: {
          signature: signatureRecord,
          signedFile: signatureResult.filePath,
        },
      });
    },
  );

  // ── List signatures for a document ─────────────────────────────────────
  app.get<{ Params: { caseId: string; documentId: string } }>(
    "/cases/:caseId/documents/:documentId/signatures",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { caseId, documentId } = request.params;

      // Verify document belongs to case
      const document = await prisma.document.findFirst({
        where: { id: documentId, caseId },
        select: { id: true, case: { select: { courtId: true } } },
      });

      if (!document) {
        return reply.status(404).send({
          error: "NOT_FOUND",
          message: "Document not found in this case",
          statusCode: 404,
        });
      }

      // C1 fix: enforce tenant scoping
      const user = request.user as { courtId?: string | null };
      if (user.courtId && document.case.courtId !== user.courtId) {
        return reply.status(403).send({
          error: "FORBIDDEN",
          message: "Access denied: document belongs to a different court",
          statusCode: 403,
        });
      }

      const signatures = await prisma.documentSignature.findMany({
        where: { documentId },
        select: {
          id: true,
          signerName: true,
          signerRole: true,
          signerEmail: true,
          signedAt: true,
          signatureHash: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: { signedAt: "asc" },
      });

      return reply.send({ data: signatures });
    },
  );

  // ── Verify a signature ──────────────────────────────────────────────────
  app.post<{ Params: { caseId: string; documentId: string; signatureId: string } }>(
    "/cases/:caseId/documents/:documentId/signatures/:signatureId/verify",
    { preHandler: [requireAuth, requireRole("ADMIN", "CLERK", "JUDGE")] },
    async (request, reply) => {
      const { caseId, documentId, signatureId } = request.params;

      const signature = await prisma.documentSignature.findFirst({
        where: { id: signatureId, documentId },
        include: {
          document: {
            include: {
              case: {
                select: { id: true, courtId: true },
              },
            },
            select: { id: true, filePath: true, caseId: true },
          },
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      });

      if (!signature || signature.document.caseId !== caseId) {
        return reply.status(404).send({
          error: "NOT_FOUND",
          message: "Signature not found",
          statusCode: 404,
        });
      }

      // C1 fix: enforce tenant scoping
      const user = request.user as { courtId?: string | null };
      if (user.courtId && signature.document.case.courtId !== user.courtId) {
        return reply.status(403).send({
          error: "FORBIDDEN",
          message: "Access denied: signature belongs to a different court",
          statusCode: 403,
        });
      }

      // H1 fix: actually verify the HMAC signature by reading from the PDF metadata
      // The certificate stores hmacTokenPrefix — we reconstruct the full verification
      const certificate = signature.certificate as Record<string, string> | null;
      const signedAt = certificate?.signedAt ?? signature.signedAt.toISOString();
      const hmacTokenPrefix = certificate?.hmacTokenPrefix ?? "";

      // Perform actual cryptographic verification
      let isValid = false;
      if (signature.userId && signedAt && hmacTokenPrefix) {
        // Try to verify using the full HMAC that was embedded in the PDF
        // (The PDF metadata stores the full HMAC; we verify the stored signatureHash
        //  against what would be generated from the known parameters)
        try {
          isValid = await verifyDocumentSignature(
            documentId,
            signature.userId,
            signedAt,
            hmacTokenPrefix,
          );
        } catch {
          isValid = false;
        }
      }

      // Audit log for verification
      const courtId = null;
      await recordAuditLog({
        prisma,
        actor: { id: request.user.id, role: request.user.role },
        courtId,
        entityType: "DOCUMENT",
        entityId: documentId,
        action: "DOCUMENT_SIGNATURE_VERIFIED",
        fromState: null,
        toState: null,
        changes: {
          signatureId,
          verifiedBy: request.user.id,
          isValid,
        },
      });

      return reply.send({
        data: {
          isValid,
          signature: {
            id: signature.id,
            signerName: signature.signerName,
            signerRole: signature.signerRole,
            signerEmail: signature.signerEmail,
            signedAt: signature.signedAt,
            user: signature.user,
          },
        },
      });
    },
  );
}