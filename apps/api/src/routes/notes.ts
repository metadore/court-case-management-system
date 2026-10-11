import type { FastifyInstance } from "fastify";
import { prisma } from "@tpt-court/database";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireTenantScope } from "../middleware/tenantScope.js";
import { z } from "zod";
import { recordAuditLog } from "../lib/audit.js";

export default async function notesRoutes(app: FastifyInstance) {
  // ── List notes for a case ─────────────────────────────────────────────
  app.get<{ Params: { caseId: string } }>(
    "/cases/:caseId/notes",
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

      // Filter by visibility based on role
      const role = request.user.role;
      let visibilityFilter: unknown;
      if (role === "PUBLIC") {
        // PUBLIC users cannot see notes at all; notes are internal
        return reply.send({ data: [] });
      } else if (role === "LAWYER") {
        // LAWYERs only see ALL_STAFF (non-private) notes
        visibilityFilter = { in: ["ALL_STAFF"] };
      } else if (role === "JUDGE") {
        // JUDGEs see ALL_STAFF and JUDGES_AND_CLERKS notes
        visibilityFilter = { in: ["ALL_STAFF", "JUDGES_AND_CLERKS"] };
      } else {
        // ADMIN and CLERK see everything
        visibilityFilter = undefined;
      }

      const where: Record<string, unknown> = { caseId };
      if (visibilityFilter) {
        where["visibility"] = visibilityFilter;
      }

      const notes = await (prisma as any).caseNote.findMany({
        where,
        include: {
          author: { select: { id: true, firstName: true, lastName: true, role: true } },
        },
        orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
      });

      return reply.send({ data: notes });
    },
  );

  // ── Create note ───────────────────────────────────────────────────────
  app.post<{ Params: { caseId: string } }>(
    "/cases/:caseId/notes",
    { preHandler: [requireAuth, requireTenantScope] },
    async (request, reply) => {
      const { caseId } = request.params;

      // PUBLIC users cannot create notes
      if (request.user.role === "PUBLIC") {
        return reply.status(403).send({ error: "FORBIDDEN", message: "Insufficient permissions", statusCode: 403 });
      }

      const schema = z.object({
        content: z.string().min(1).max(10000),
        visibility: z.enum(["PRIVATE", "JUDGES_AND_CLERKS", "ALL_STAFF"]).optional(),
        isPinned: z.boolean().optional(),
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

      const note = await (prisma as any).caseNote.create({
        data: {
          caseId,
          authorId: request.user.id,
          content: parsed.data.content,
          visibility: parsed.data.visibility ?? "ALL_STAFF",
          isPinned: parsed.data.isPinned ?? false,
        },
        include: {
          author: { select: { id: true, firstName: true, lastName: true, role: true } },
        },
      });

      await recordAuditLog({
        prisma,
        actor: { id: request.user.id, role: request.user.role },
        courtId: caseRecord.courtId ?? null,
        entityType: "CASE",
        entityId: caseId,
        action: "NOTE_CREATED",
        fromState: null,
        toState: null,
        changes: { noteId: note.id, visibility: note.visibility },
      });

      return reply.status(201).send({ data: note });
    },
  );

  // ── Update note ───────────────────────────────────────────────────────
  app.patch<{ Params: { caseId: string; id: string } }>(
    "/cases/:caseId/notes/:id",
    { preHandler: [requireAuth, requireTenantScope] },
    async (request, reply) => {
      const { caseId, id } = request.params;

      const schema = z.object({
        content: z.string().min(1).max(10000).optional(),
        visibility: z.enum(["PRIVATE", "JUDGES_AND_CLERKS", "ALL_STAFF"]).optional(),
        isPinned: z.boolean().optional(),
      });

      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "VALIDATION_ERROR", message: parsed.error.message, statusCode: 400 });
      }

      const existing = await (prisma as any).caseNote.findFirst({
        where: { id, caseId },
        include: { case: { select: { courtId: true } } },
      });
      if (!existing) {
        return reply.status(404).send({ error: "NOT_FOUND", message: "Note not found", statusCode: 404 });
      }

      const userCourtId = request.user.courtId;
      if (userCourtId && existing.case.courtId !== userCourtId) {
        return reply.status(403).send({ error: "FORBIDDEN", message: "Access denied", statusCode: 403 });
      }

      // Only author or ADMIN can update
      if (existing.authorId !== request.user.id && request.user.role !== "ADMIN") {
        return reply.status(403).send({ error: "FORBIDDEN", message: "Only the note author or an admin can update this note", statusCode: 403 });
      }

      const updated = await (prisma as any).caseNote.update({
        where: { id },
        data: parsed.data,
        include: {
          author: { select: { id: true, firstName: true, lastName: true, role: true } },
        },
      });

      return reply.send({ data: updated });
    },
  );

  // ── Delete note ───────────────────────────────────────────────────────
  app.delete<{ Params: { caseId: string; id: string } }>(
    "/cases/:caseId/notes/:id",
    { preHandler: [requireAuth, requireTenantScope] },
    async (request, reply) => {
      const { caseId, id } = request.params;

      const existing = await (prisma as any).caseNote.findFirst({
        where: { id, caseId },
        include: { case: { select: { courtId: true } } },
      });
      if (!existing) {
        return reply.status(404).send({ error: "NOT_FOUND", message: "Note not found", statusCode: 404 });
      }

      const userCourtId = request.user.courtId;
      if (userCourtId && existing.case.courtId !== userCourtId) {
        return reply.status(403).send({ error: "FORBIDDEN", message: "Access denied", statusCode: 403 });
      }

      // Only author or ADMIN can delete
      if (existing.authorId !== request.user.id && request.user.role !== "ADMIN") {
        return reply.status(403).send({ error: "FORBIDDEN", message: "Only the note author or an admin can delete this note", statusCode: 403 });
      }

      await (prisma as any).caseNote.delete({ where: { id } });

      await recordAuditLog({
        prisma,
        actor: { id: request.user.id, role: request.user.role },
        courtId: existing.case.courtId ?? null,
        entityType: "CASE",
        entityId: caseId,
        action: "NOTE_DELETED",
        fromState: null,
        toState: null,
        changes: { noteId: id },
      });

      return reply.send({ data: { message: "Note deleted" } });
    },
  );
}
