import type { FastifyInstance } from "fastify";
import { prisma } from "@tpt-court/database";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { requireTenantScope } from "../middleware/tenantScope.js";
import { z } from "zod";
import { recordAuditLog } from "../lib/audit.js";

export default async function evidenceRoutes(app: FastifyInstance) {
  // ── List evidence for a case ───────────────────────────────────────────
  app.get<{ Params: { caseId: string } }>(
    "/cases/:caseId/evidence",
    { preHandler: [requireAuth, requireTenantScope] },
    async (request, reply) => {
      const { caseId } = request.params;

      const caseRecord = await prisma.case.findUnique({
        where: { id: caseId },
        select: { id: true, courtId: true },
      });
      if (!caseRecord) {
        return reply.status(404).send({ error: "NOT_FOUND", message: "Case not found", statusCode: 404 });
      }
      const userCourtId = request.user.courtId;
      if (userCourtId && caseRecord.courtId !== userCourtId) {
        return reply.status(403).send({ error: "FORBIDDEN", message: "Access denied", statusCode: 403 });
      }

      const evidence = await (prisma as any).evidence.findMany({
        where: { caseId },
        include: {
          custodian: { select: { id: true, firstName: true, lastName: true } },
          transfers: {
            orderBy: { transferredAt: "desc" },
            take: 1,
            include: {
              fromCustodian: { select: { id: true, firstName: true, lastName: true } },
              toCustodian: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
        orderBy: { intakeDate: "desc" },
      });

      return reply.send({ data: evidence });
    },
  );

  // ── Intake new evidence ────────────────────────────────────────────────
  app.post<{ Params: { caseId: string } }>(
    "/cases/:caseId/evidence",
    { preHandler: [requireAuth, requireTenantScope, requireRole("ADMIN", "CLERK", "JUDGE")] },
    async (request, reply) => {
      const { caseId } = request.params;

      const schema = z.object({
        title: z.string().min(1).max(500),
        description: z.string().max(5000).optional(),
        type: z.enum(["PHYSICAL", "DOCUMENTARY", "DIGITAL", "TESTIMONIAL", "DEMONSTRATIVE", "OTHER"]),
        storageLocation: z.string().max(500).optional(),
        condition: z.string().max(500).optional(),
        exhibitNumber: z.string().max(100).optional(),
      });

      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "VALIDATION_ERROR", message: parsed.error.message, statusCode: 400 });
      }

      const caseRecord = await prisma.case.findUnique({
        where: { id: caseId },
        select: { id: true, courtId: true },
      });
      if (!caseRecord) {
        return reply.status(404).send({ error: "NOT_FOUND", message: "Case not found", statusCode: 404 });
      }
      const userCourtId = request.user.courtId;
      if (userCourtId && caseRecord.courtId !== userCourtId) {
        return reply.status(403).send({ error: "FORBIDDEN", message: "Access denied", statusCode: 403 });
      }

      const item = await (prisma as any).evidence.create({
        data: {
          caseId,
          title: parsed.data.title,
          description: parsed.data.description ?? null,
          type: parsed.data.type,
          status: "INTAKE",
          intakeDate: new Date(),
          custodianId: request.user.id,
          storageLocation: parsed.data.storageLocation ?? null,
          condition: parsed.data.condition ?? null,
          exhibitNumber: parsed.data.exhibitNumber ?? null,
        },
        include: {
          custodian: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      await recordAuditLog({
        prisma,
        actor: { id: request.user.id, role: request.user.role },
        courtId: caseRecord.courtId ?? null,
        entityType: "CASE",
        entityId: caseId,
        action: "EVIDENCE_INTAKE",
        fromState: null,
        toState: "INTAKE",
        changes: { evidenceId: item.id, title: item.title, type: item.type },
      });

      return reply.status(201).send({ data: item });
    },
  );

  // ── Update evidence ────────────────────────────────────────────────────
  app.patch<{ Params: { caseId: string; id: string } }>(
    "/cases/:caseId/evidence/:id",
    { preHandler: [requireAuth, requireTenantScope, requireRole("ADMIN", "CLERK", "JUDGE")] },
    async (request, reply) => {
      const { caseId, id } = request.params;

      const schema = z.object({
        title: z.string().min(1).max(500).optional(),
        description: z.string().max(5000).optional(),
        status: z.enum(["INTAKE", "IN_CUSTODY", "TRANSFERRED", "RELEASED", "DESTROYED"]).optional(),
        storageLocation: z.string().max(500).nullable().optional(),
        condition: z.string().max(500).nullable().optional(),
        exhibitNumber: z.string().max(100).nullable().optional(),
      });

      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "VALIDATION_ERROR", message: parsed.error.message, statusCode: 400 });
      }

      const existing = await (prisma as any).evidence.findFirst({
        where: { id, caseId },
        include: { case: { select: { courtId: true } } },
      });
      if (!existing) {
        return reply.status(404).send({ error: "NOT_FOUND", message: "Evidence not found", statusCode: 404 });
      }

      const userCourtId = request.user.courtId;
      if (userCourtId && existing.case.courtId !== userCourtId) {
        return reply.status(403).send({ error: "FORBIDDEN", message: "Access denied", statusCode: 403 });
      }

      const updated = await (prisma as any).evidence.update({
        where: { id },
        data: parsed.data,
        include: {
          custodian: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      await recordAuditLog({
        prisma,
        actor: { id: request.user.id, role: request.user.role },
        courtId: existing.case.courtId ?? null,
        entityType: "CASE",
        entityId: caseId,
        action: "EVIDENCE_UPDATED",
        fromState: existing.status,
        toState: updated.status,
        changes: parsed.data,
      });

      return reply.send({ data: updated });
    },
  );

  // ── Transfer custody ───────────────────────────────────────────────────
  app.post<{ Params: { caseId: string; id: string } }>(
    "/cases/:caseId/evidence/:id/transfer",
    { preHandler: [requireAuth, requireTenantScope, requireRole("ADMIN", "CLERK", "JUDGE")] },
    async (request, reply) => {
      const { caseId, id } = request.params;

      const schema = z.object({
        toCustodianId: z.string(),
        reason: z.string().max(1000).optional(),
        notes: z.string().max(5000).optional(),
      });

      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "VALIDATION_ERROR", message: parsed.error.message, statusCode: 400 });
      }

      const existing = await (prisma as any).evidence.findFirst({
        where: { id, caseId },
        include: { case: { select: { courtId: true } } },
      });
      if (!existing) {
        return reply.status(404).send({ error: "NOT_FOUND", message: "Evidence not found", statusCode: 404 });
      }

      const userCourtId = request.user.courtId;
      if (userCourtId && existing.case.courtId !== userCourtId) {
        return reply.status(403).send({ error: "FORBIDDEN", message: "Access denied", statusCode: 403 });
      }

      // Create transfer record and update evidence in a transaction
      const [transfer] = await prisma.$transaction([
        (prisma as any).evidenceTransfer.create({
          data: {
            evidenceId: id,
            fromCustodianId: existing.custodianId ?? null,
            toCustodianId: parsed.data.toCustodianId,
            transferredAt: new Date(),
            reason: parsed.data.reason ?? null,
            notes: parsed.data.notes ?? null,
          },
          include: {
            fromCustodian: { select: { id: true, firstName: true, lastName: true } },
            toCustodian: { select: { id: true, firstName: true, lastName: true } },
          },
        }),
        (prisma as any).evidence.update({
          where: { id },
          data: {
            custodianId: parsed.data.toCustodianId,
            status: "TRANSFERRED",
          },
        }),
      ]);

      await recordAuditLog({
        prisma,
        actor: { id: request.user.id, role: request.user.role },
        courtId: existing.case.courtId ?? null,
        entityType: "CASE",
        entityId: caseId,
        action: "EVIDENCE_TRANSFERRED",
        fromState: existing.status,
        toState: "TRANSFERRED",
        changes: {
          evidenceId: id,
          fromCustodianId: existing.custodianId,
          toCustodianId: parsed.data.toCustodianId,
          reason: parsed.data.reason,
        },
      });

      return reply.status(201).send({ data: transfer });
    },
  );

  // ── Chain of custody ───────────────────────────────────────────────────
  app.get<{ Params: { caseId: string; id: string } }>(
    "/cases/:caseId/evidence/:id/transfers",
    { preHandler: [requireAuth, requireTenantScope] },
    async (request, reply) => {
      const { caseId, id } = request.params;

      const existing = await (prisma as any).evidence.findFirst({
        where: { id, caseId },
        include: { case: { select: { courtId: true } } },
      });
      if (!existing) {
        return reply.status(404).send({ error: "NOT_FOUND", message: "Evidence not found", statusCode: 404 });
      }

      const userCourtId = request.user.courtId;
      if (userCourtId && existing.case.courtId !== userCourtId) {
        return reply.status(403).send({ error: "FORBIDDEN", message: "Access denied", statusCode: 403 });
      }

      const transfers = await (prisma as any).evidenceTransfer.findMany({
        where: { evidenceId: id },
        include: {
          fromCustodian: { select: { id: true, firstName: true, lastName: true } },
          toCustodian: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { transferredAt: "asc" },
      });

      return reply.send({ data: transfers });
    },
  );
}
