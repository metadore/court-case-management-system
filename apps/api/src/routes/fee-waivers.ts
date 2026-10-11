import type { FastifyInstance } from "fastify";
import { prisma } from "@tpt-court/database";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { requireTenantScope } from "../middleware/tenantScope.js";
import { z } from "zod";
import { recordAuditLog } from "../lib/audit.js";

export default async function feeWaiverRoutes(app: FastifyInstance) {
  // ── List fee waiver applications ───────────────────────────────────────
  app.get<{ Params: { caseId: string } }>(
    "/cases/:caseId/fee-waivers",
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

      const where: Record<string, unknown> = { caseId };

      // Non-staff users only see their own applications
      const role = request.user.role;
      if (role === "PUBLIC" || role === "LAWYER") {
        where["applicantId"] = request.user.id;
      }

      const applications = await (prisma as any).feeWaiverApplication.findMany({
        where,
        include: {
          applicant: { select: { id: true, firstName: true, lastName: true, email: true } },
          reviewedBy: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      return reply.send({ data: applications });
    },
  );

  // ── Submit fee waiver application ──────────────────────────────────────
  app.post<{ Params: { caseId: string } }>(
    "/cases/:caseId/fee-waivers",
    { preHandler: [requireAuth, requireTenantScope] },
    async (request, reply) => {
      const { caseId } = request.params;

      const schema = z.object({
        incomeAmount: z.number().int().min(0),
        householdSize: z.number().int().min(1),
        numberOfDependents: z.number().int().min(0).default(0),
        employmentStatus: z.string().max(200).optional(),
        assets: z.string().max(2000).optional(),
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

      const application = await (prisma as any).feeWaiverApplication.create({
        data: {
          caseId,
          applicantId: request.user.id,
          incomeAmount: parsed.data.incomeAmount,
          householdSize: parsed.data.householdSize,
          numberOfDependents: parsed.data.numberOfDependents,
          employmentStatus: parsed.data.employmentStatus ?? null,
          assets: parsed.data.assets ?? null,
          status: "PENDING",
        },
        include: {
          applicant: { select: { id: true, firstName: true, lastName: true, email: true } },
          reviewedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      await recordAuditLog({
        prisma,
        actor: { id: request.user.id, role: request.user.role },
        courtId: caseRecord.courtId ?? null,
        entityType: "CASE",
        entityId: caseId,
        action: "FEE_WAIVER_SUBMITTED",
        fromState: null,
        toState: "PENDING",
        changes: { applicationId: application.id },
      });

      return reply.status(201).send({ data: application });
    },
  );

  // ── Review fee waiver (ADMIN|CLERK only) ──────────────────────────────
  app.patch<{ Params: { caseId: string; id: string } }>(
    "/cases/:caseId/fee-waivers/:id",
    { preHandler: [requireAuth, requireTenantScope, requireRole("ADMIN", "CLERK")] },
    async (request, reply) => {
      const { caseId, id } = request.params;

      const schema = z.object({
        status: z.enum(["APPROVED", "DENIED"]),
        reviewNotes: z.string().max(5000).optional(),
      });

      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "VALIDATION_ERROR", message: parsed.error.message, statusCode: 400 });
      }

      const existing = await (prisma as any).feeWaiverApplication.findFirst({
        where: { id, caseId },
        include: { case: { select: { courtId: true } } },
      });
      if (!existing) {
        return reply.status(404).send({ error: "NOT_FOUND", message: "Fee waiver application not found", statusCode: 404 });
      }

      const userCourtId = request.user.courtId;
      if (userCourtId && existing.case.courtId !== userCourtId) {
        return reply.status(403).send({ error: "FORBIDDEN", message: "Access denied", statusCode: 403 });
      }

      if (existing.status !== "PENDING") {
        return reply.status(400).send({
          error: "ALREADY_REVIEWED",
          message: "This fee waiver application has already been reviewed",
          statusCode: 400,
        });
      }

      const updated = await (prisma as any).feeWaiverApplication.update({
        where: { id },
        data: {
          status: parsed.data.status,
          reviewedById: request.user.id,
          reviewedAt: new Date(),
          reviewNotes: parsed.data.reviewNotes ?? null,
        },
        include: {
          applicant: { select: { id: true, firstName: true, lastName: true, email: true } },
          reviewedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      // If approved, mark PENDING FILING_FEE payments for this case as REFUNDED
      if (parsed.data.status === "APPROVED") {
        await prisma.payment.updateMany({
          where: {
            caseId,
            type: "FILING_FEE",
            status: "PENDING",
            stripePaymentIntentId: null,
          },
          data: { status: "REFUNDED" },
        });
      }

      await recordAuditLog({
        prisma,
        actor: { id: request.user.id, role: request.user.role },
        courtId: existing.case.courtId ?? null,
        entityType: "CASE",
        entityId: caseId,
        action: "FEE_WAIVER_REVIEWED",
        fromState: "PENDING",
        toState: parsed.data.status,
        changes: { applicationId: id, status: parsed.data.status },
      });

      return reply.send({ data: updated });
    },
  );
}
