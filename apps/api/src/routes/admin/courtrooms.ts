import type { FastifyInstance } from "fastify";
import { prisma } from "@tpt-court/database";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import { requireTenantScope, scopeWhere } from "../../middleware/tenantScope.js";
import { z } from "zod";

export default async function courtroomRoutes(app: FastifyInstance) {
  const guard = { preHandler: [requireAuth, requireTenantScope, requireRole("ADMIN")] };

  // ── List courtrooms ────────────────────────────────────────────────────
  app.get("/courtrooms", guard, async (request, reply) => {
    const tenantFilter = scopeWhere(request);

    const courtrooms = await prisma.courtroom.findMany({
      where: tenantFilter.courtId ? { courtId: tenantFilter.courtId as string } : {},
      orderBy: { name: "asc" },
    });

    return reply.send({ data: courtrooms });
  });

  // ── Create courtroom ───────────────────────────────────────────────────
  app.post("/courtrooms", guard, async (request, reply) => {
    const schema = z.object({
      name: z.string().min(1).max(200),
      capacity: z.number().int().min(1).optional(),
      isActive: z.boolean().default(true),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: parsed.error.message, statusCode: 400 });
    }

    if (!request.user.courtId) {
      return reply.status(400).send({ error: "NO_COURT", message: "Your account is not associated with a court.", statusCode: 400 });
    }

    const courtroom = await prisma.courtroom.create({
      data: {
        courtId: request.user.courtId,
        name: parsed.data.name,
        capacity: parsed.data.capacity ?? null,
        isActive: parsed.data.isActive,
      },
    });

    return reply.status(201).send({ data: courtroom });
  });

  // ── Update courtroom ───────────────────────────────────────────────────
  app.patch<{ Params: { id: string } }>("/courtrooms/:id", guard, async (request, reply) => {
    const schema = z.object({
      name: z.string().min(1).max(200).optional(),
      capacity: z.number().int().min(1).nullable().optional(),
      isActive: z.boolean().optional(),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: parsed.error.message, statusCode: 400 });
    }

    const existing = await prisma.courtroom.findUnique({ where: { id: request.params.id } });
    if (!existing) {
      return reply.status(404).send({ error: "NOT_FOUND", message: "Courtroom not found", statusCode: 404 });
    }

    // Tenant check
    const userCourtId = request.user.courtId;
    if (userCourtId && existing.courtId !== userCourtId) {
      return reply.status(403).send({ error: "FORBIDDEN", message: "Access denied", statusCode: 403 });
    }

    const updated = await prisma.courtroom.update({
      where: { id: request.params.id },
      data: parsed.data,
    });

    return reply.send({ data: updated });
  });

  // ── Soft-delete courtroom (set isActive=false) ─────────────────────────
  app.delete<{ Params: { id: string } }>("/courtrooms/:id", guard, async (request, reply) => {
    const existing = await prisma.courtroom.findUnique({ where: { id: request.params.id } });
    if (!existing) {
      return reply.status(404).send({ error: "NOT_FOUND", message: "Courtroom not found", statusCode: 404 });
    }

    const userCourtId = request.user.courtId;
    if (userCourtId && existing.courtId !== userCourtId) {
      return reply.status(403).send({ error: "FORBIDDEN", message: "Access denied", statusCode: 403 });
    }

    const updated = await prisma.courtroom.update({
      where: { id: request.params.id },
      data: { isActive: false },
    });

    return reply.send({ data: updated });
  });
}
