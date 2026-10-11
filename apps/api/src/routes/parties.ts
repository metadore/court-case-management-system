import type { FastifyInstance } from "fastify";
import { prisma } from "@tpt-court/database";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { requireTenantScope } from "../middleware/tenantScope.js";
import { z } from "zod";
import { recordAuditLog } from "../lib/audit.js";

export default async function partyRoutes(app: FastifyInstance) {
  // ── Add a party to a case ──────────────────────────────────────────────
  app.post<{ Params: { caseId: string } }>(
    "/cases/:caseId/parties",
    { preHandler: [requireAuth, requireTenantScope, requireRole("ADMIN", "CLERK", "JUDGE")] },
    async (request, reply) => {
      const { caseId } = request.params;

      const schema = z.object({
        name: z.string().min(1).max(255),
        role: z.enum(["PLAINTIFF", "DEFENDANT", "COUNSEL_PLAINTIFF", "COUNSEL_DEFENDANT", "INTERVENOR", "WITNESS", "AMICUS", "OTHER"]),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        userId: z.string().optional(),
        representationStatus: z.enum(["UNREPRESENTED_PENDING", "PRO_SE", "COUNSEL_RETAINED", "COUNSEL_APPOINTED"]).optional(),
        appointmentType: z.enum(["RETAINED", "APPOINTED"]).optional(),
        interpreterNeeded: z.boolean().default(false),
        interpreterLanguage: z.string().optional(),
      });

      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "VALIDATION_ERROR", message: parsed.error.message, statusCode: 400 });
      }

      const caseRecord = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, courtId: true } });
      if (!caseRecord) {
        return reply.status(404).send({ error: "NOT_FOUND", message: "Case not found", statusCode: 404 });
      }

      const userCourtId = request.user.courtId;
      if (userCourtId && caseRecord.courtId !== userCourtId) {
        return reply.status(403).send({ error: "FORBIDDEN", message: "Access denied: case belongs to a different court", statusCode: 403 });
      }

      const party = await prisma.party.create({
        data: {
          caseId,
          name: parsed.data.name,
          role: parsed.data.role,
          email: parsed.data.email ?? null,
          phone: parsed.data.phone ?? null,
          address: parsed.data.address ?? null,
          userId: parsed.data.userId ?? null,
          representationStatus: parsed.data.representationStatus ?? null,
          appointmentType: parsed.data.appointmentType ?? null,
          interpreterNeeded: parsed.data.interpreterNeeded,
          interpreterLanguage: parsed.data.interpreterLanguage ?? null,
        },
      });

      await recordAuditLog({
        prisma,
        actor: { id: request.user.id, role: request.user.role },
        courtId: caseRecord.courtId,
        entityType: "PARTY",
        entityId: party.id,
        action: "PARTY_ADDED",
        fromState: null,
        toState: party.role,
        changes: { name: party.name, role: party.role, representationStatus: party.representationStatus },
      });

      return reply.status(201).send({ data: party });
    },
  );

  // ── Update a party ─────────────────────────────────────────────────────
  app.patch<{ Params: { caseId: string; partyId: string } }>(
    "/cases/:caseId/parties/:partyId",
    { preHandler: [requireAuth, requireTenantScope, requireRole("ADMIN", "CLERK", "JUDGE")] },
    async (request, reply) => {
      const { caseId, partyId } = request.params;

      const schema = z.object({
        name: z.string().min(1).max(255).optional(),
        role: z.enum(["PLAINTIFF", "DEFENDANT", "COUNSEL_PLAINTIFF", "COUNSEL_DEFENDANT", "INTERVENOR", "WITNESS", "AMICUS", "OTHER"]).optional(),
        email: z.string().email().nullable().optional(),
        phone: z.string().nullable().optional(),
        address: z.string().nullable().optional(),
        userId: z.string().nullable().optional(),
        representationStatus: z.enum(["UNREPRESENTED_PENDING", "PRO_SE", "COUNSEL_RETAINED", "COUNSEL_APPOINTED"]).nullable().optional(),
        appointmentType: z.enum(["RETAINED", "APPOINTED"]).nullable().optional(),
        servedAt: z.string().datetime().nullable().optional(),
        serviceMethod: z.string().nullable().optional(),
        interpreterNeeded: z.boolean().optional(),
        interpreterLanguage: z.string().nullable().optional(),
      });

      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "VALIDATION_ERROR", message: parsed.error.message, statusCode: 400 });
      }

      const existing = await prisma.party.findUnique({
        where: { id: partyId },
        include: { case: { select: { courtId: true } } },
      });

      if (!existing || existing.caseId !== caseId) {
        return reply.status(404).send({ error: "NOT_FOUND", message: "Party not found", statusCode: 404 });
      }

      const userCourtId = request.user.courtId;
      if (userCourtId && existing.case.courtId !== userCourtId) {
        return reply.status(403).send({ error: "FORBIDDEN", message: "Access denied: case belongs to a different court", statusCode: 403 });
      }

      const updateData: Record<string, unknown> = { ...parsed.data };
      if (parsed.data.servedAt !== undefined) {
        updateData["servedAt"] = parsed.data.servedAt ? new Date(parsed.data.servedAt) : null;
      }

      const updated = await prisma.party.update({
        where: { id: partyId },
        data: updateData,
      });

      await recordAuditLog({
        prisma,
        actor: { id: request.user.id, role: request.user.role },
        courtId: existing.case.courtId,
        entityType: "PARTY",
        entityId: partyId,
        action: "PARTY_UPDATED",
        fromState: null,
        toState: null,
        changes: parsed.data,
      });

      return reply.send({ data: updated });
    },
  );
}
