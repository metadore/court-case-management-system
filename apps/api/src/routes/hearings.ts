import type { FastifyInstance } from "fastify";
import { prisma } from "@tpt-court/database";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { requireTenantScope, scopeWhere } from "../middleware/tenantScope.js";
import { z } from "zod";
import { recordAuditLog } from "../lib/audit.js";
import { dispatchCaseEvent, scheduleHearingReminder } from "../notifications/dispatch.js";
import crypto from "crypto";


export default async function hearingRoutes(app: FastifyInstance) {
  // ── List hearings for the current user ─────────────────────────────────
  app.get("/hearings", { preHandler: [requireAuth, requireTenantScope] }, async (request, reply) => {
    const query = request.query as Record<string, string>;
    const from = query["from"] ? new Date(query["from"]) : null;
    const to   = query["to"]   ? new Date(query["to"])   : null;

    const where: Record<string, unknown> = {};

    if (from || to) {
      const scheduledAt: Record<string, Date> = {};
      if (from) scheduledAt["gte"] = from;
      if (to)   scheduledAt["lte"] = to;
      where["scheduledAt"] = scheduledAt;
    }

    // C1 fix: apply tenant scoping
    const tenantFilter = scopeWhere(request);
    if (tenantFilter.courtId) {
      // Hearings don't have a courtId directly; scope via case
      where["case"] = { courtId: tenantFilter.courtId };
    }

    if (request.user.role === "JUDGE") {
      where["judgeId"] = request.user.id;
    } else if (request.user.role === "LAWYER" || request.user.role === "PUBLIC") {
      const partyCases = await prisma.party.findMany({
        where: { userId: request.user.id },
        select: { caseId: true },
      });
      where["caseId"] = { in: partyCases.map((p: { caseId: string }) => p.caseId) };
    }

    const hearings = await prisma.hearing.findMany({
      where,
      select: {
        id: true,
        scheduledAt: true,
        durationMins: true,
        type: true,
        status: true,
        format: true,
        notes: true,
        meetingLink: true,
        continuedFromId: true,
        continuedFrom: { select: { id: true, scheduledAt: true, type: true } },
        case: { select: { id: true, caseNumber: true, title: true } },
        judge: { select: { firstName: true, lastName: true } },
        courtroom: { select: { name: true } },
      },
      orderBy: { scheduledAt: "asc" },
    });

    return reply.send({ data: hearings });
  });

  // ── Get hearings for a specific case ───────────────────────────────────
  app.get<{ Params: { caseId: string } }>("/cases/:caseId/hearings", { preHandler: [requireAuth, requireTenantScope] }, async (request, reply) => {
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

    const hearings = await prisma.hearing.findMany({
      where: { caseId },
      select: {
        id: true,
        scheduledAt: true,
        durationMins: true,
        type: true,
        status: true,
        format: true,
        notes: true,
        meetingLink: true,
        continuedFromId: true,
        continuedFrom: { select: { id: true, scheduledAt: true, type: true } },
        judge: { select: { firstName: true, lastName: true } },
        courtroom: { select: { name: true } },
      },
      orderBy: { scheduledAt: "asc" },
    });

    return reply.send({ data: hearings });
  });

  // ── Schedule a hearing ─────────────────────────────────────────────────
  app.post<{ Params: { caseId: string } }>("/cases/:caseId/hearings", { preHandler: [requireAuth, requireTenantScope, requireRole("ADMIN", "CLERK", "JUDGE")] }, async (request, reply) => {
    const { caseId } = request.params;

    const schema = z.object({
      scheduledAt: z.string().datetime(),
      durationMins: z.number().int().min(5).max(480),
      type: z.enum(["ARRAIGNMENT", "BAIL", "PRELIMINARY", "TRIAL", "MOTION_HEARING", "SENTENCING", "APPEAL", "STATUS_CONFERENCE", "OTHER"]),
      format: z.enum(["IN_PERSON", "VIRTUAL", "HYBRID"]).default("IN_PERSON"),
      notes: z.string().max(5000).optional(),
      judgeId: z.string().optional(),
      courtroomId: z.string().optional(),
      continuedFromId: z.string().optional(),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: parsed.error.message, statusCode: 400 });
    }

    // C1 fix: enforce tenant scoping on case
    const caseRecord = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, courtId: true } });
    if (!caseRecord) {
      return reply.status(404).send({ error: "NOT_FOUND", message: "Case not found", statusCode: 404 });
    }
    const userCourtId = request.user.courtId;
    if (userCourtId && caseRecord.courtId !== userCourtId) {
      return reply.status(403).send({ error: "FORBIDDEN", message: "Access denied: case belongs to a different court", statusCode: 403 });
    }

    const startAt = new Date(parsed.data.scheduledAt);
    const endAt = new Date(startAt.getTime() + parsed.data.durationMins * 60_000);

    // Reject double-booking the same judge or courtroom
    if (parsed.data.judgeId || parsed.data.courtroomId) {
      const conflicts = await prisma.hearing.findMany({
        where: {
          status: { in: ["SCHEDULED", "IN_PROGRESS"] },
          OR: [
            parsed.data.judgeId ? { judgeId: parsed.data.judgeId } : {},
            parsed.data.courtroomId ? { courtroomId: parsed.data.courtroomId } : {},
          ].filter((c) => Object.keys(c).length > 0),
          AND: [
            { scheduledAt: { lt: endAt } },
            {
              scheduledAt: {
                lt: endAt,
              },
            },
          ],
        },
        select: { id: true, scheduledAt: true, durationMins: true, judgeId: true, courtroomId: true },
      });

      // Filter to actual overlaps (end of existing > start of new)
      const actualConflicts = conflicts.filter((h) => {
        const existingEnd = new Date(h.scheduledAt.getTime() + h.durationMins * 60_000);
        return existingEnd > startAt;
      });

      if (actualConflicts.length > 0) {
        const conflict = actualConflicts[0]!;
        const resource = conflict.judgeId === parsed.data.judgeId ? "judge" : "courtroom";
        return reply.status(409).send({
          error: "SCHEDULING_CONFLICT",
          message: `This ${resource} is already booked during the requested time slot.`,
          statusCode: 409,
          conflictingHearingId: conflict.id,
        });
      }
    }

    // Auto-generate a Jitsi Meet link for virtual/hybrid hearings
    const meetingLink =
      parsed.data.format === "VIRTUAL" || parsed.data.format === "HYBRID"
        ? `https://meet.jit.si/tpt-court-${crypto.randomUUID().slice(0, 8)}`
        : null;

    const hearing = await prisma.hearing.create({
      data: {
        caseId,
        scheduledAt: startAt,
        durationMins: parsed.data.durationMins,
        type: parsed.data.type,
        format: parsed.data.format,
        notes: parsed.data.notes ?? null,
        judgeId: parsed.data.judgeId ?? null,
        courtroomId: parsed.data.courtroomId ?? null,
        continuedFromId: parsed.data.continuedFromId ?? null,
        meetingLink,
      },
    });

    const courtId = caseRecord.courtId ?? null;

    await recordAuditLog({
      prisma,
      actor: { id: request.user.id, role: request.user.role },
      courtId,
      entityType: "HEARING",
      entityId: hearing.id,
      action: "HEARING_CREATED",
      fromState: null,
      toState: hearing.status,
      changes: { type: hearing.type, scheduledAt: hearing.scheduledAt.toISOString(), durationMins: hearing.durationMins },
    });

    dispatchCaseEvent(caseId, "HEARING_SCHEDULED", {
      hearingType: hearing.type,
      scheduledAt: hearing.scheduledAt.toLocaleString(),
    }).catch(() => {/* non-blocking */});

    scheduleHearingReminder(caseId, hearing.id, hearing.type, hearing.scheduledAt)
      .catch(() => {/* non-blocking */});

    return reply.status(201).send({ data: hearing });
  });

  // ── iCal export for a single hearing ──────────────────────────────────
  app.get<{ Params: { caseId: string; id: string } }>("/cases/:caseId/hearings/:id/ical", { preHandler: [requireAuth, requireTenantScope] }, async (request, reply) => {
    const { caseId, id } = request.params;

    const hearing = await prisma.hearing.findFirst({
      where: { id, caseId },
      include: {
        case: { select: { caseNumber: true, title: true, courtId: true } },
        judge: { select: { firstName: true, lastName: true } },
        courtroom: { select: { name: true } },
      },
    });

    if (!hearing) {
      return reply.status(404).send({ error: "NOT_FOUND", message: "Hearing not found", statusCode: 404 });
    }

    // C1 fix: enforce tenant scoping
    const userCourtId = request.user.courtId;
    if (userCourtId && hearing.case.courtId !== userCourtId) {
      return reply.status(403).send({ error: "FORBIDDEN", message: "Access denied: case belongs to a different court", statusCode: 403 });
    }

    const start = hearing.scheduledAt;
    const end = new Date(start.getTime() + hearing.durationMins * 60_000);
    const formatIcalDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

    // Escape iCal TEXT values per RFC 5545 §3.3.11 to prevent header injection
    const escapeIcalText = (s: string) =>
      s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

    const location = escapeIcalText(hearing.courtroom?.name ?? "");

    const description = escapeIcalText(
      [
        `Case: ${hearing.case.caseNumber} — ${hearing.case.title}`,
        hearing.judge ? `Judge: ${hearing.judge.firstName} ${hearing.judge.lastName}` : "",
        hearing.notes ? `Notes: ${hearing.notes}` : "",
      ].filter(Boolean).join("\n"),
    );

    const summary = escapeIcalText(`${hearing.type} Hearing — ${hearing.case.caseNumber}`);

    const ical = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//TPT Court//NONSGML v1.0//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:hearing-${hearing.id}@tpt-court`,
      `DTSTAMP:${formatIcalDate(new Date())}Z`,
      `DTSTART:${formatIcalDate(start)}Z`,
      `DTEND:${formatIcalDate(end)}Z`,
      `SUMMARY:${summary}`,
      location ? `LOCATION:${location}` : "",
      `DESCRIPTION:${description}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].filter(Boolean).join("\r\n");

    return reply
      .header("Content-Type", "text/calendar; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="hearing-${hearing.id}.ics"`)
      .send(ical);
  });

  // ── Update hearing status ──────────────────────────────────────────────
  app.patch<{ Params: { caseId: string; id: string } }>("/cases/:caseId/hearings/:id", { preHandler: [requireAuth, requireTenantScope, requireRole("ADMIN", "CLERK", "JUDGE")] }, async (request, reply) => {
    const { caseId, id } = request.params;

    const schema = z.object({
      status: z.enum(["SCHEDULED", "IN_PROGRESS", "COMPLETED", "ADJOURNED", "CANCELLED", "NO_SHOW"]).optional(),
      format: z.enum(["IN_PERSON", "VIRTUAL", "HYBRID"]).optional(),
      notes: z.string().max(5000).optional(),
      continuedFromId: z.string().nullable().optional(),
      scheduledAt: z.string().datetime().optional(),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: parsed.error.message, statusCode: 400 });
    }

    const existing = await prisma.hearing.findUnique({ where: { id } });
    if (!existing || existing.caseId !== caseId) {
      return reply.status(404).send({ error: "NOT_FOUND", message: "Hearing not found", statusCode: 404 });
    }

    // C1 fix: enforce tenant scoping
    const caseRecord = await prisma.case.findUnique({ where: { id: caseId }, select: { courtId: true } });
    const userCourtId = request.user.courtId;
    if (userCourtId && caseRecord && caseRecord.courtId !== userCourtId) {
      return reply.status(403).send({ error: "FORBIDDEN", message: "Access denied: case belongs to a different court", statusCode: 403 });
    }

    // Conflict detection when rescheduling
    if (parsed.data.scheduledAt) {
      const newStart = new Date(parsed.data.scheduledAt);
      const durationMins = existing.durationMins;
      const newEnd = new Date(newStart.getTime() + durationMins * 60_000);
      const conflicts = await prisma.hearing.findMany({
        where: {
          id: { not: id },
          status: { notIn: ["CANCELLED", "COMPLETED"] },
          OR: [
            ...(existing.judgeId ? [{ judgeId: existing.judgeId }] : []),
            ...(existing.courtroomId ? [{ courtroomId: existing.courtroomId }] : []),
          ],
          scheduledAt: { lt: newEnd },
          AND: [{ scheduledAt: { gte: new Date(newStart.getTime() - 240 * 60_000) } }],
        },
        select: { id: true, scheduledAt: true, durationMins: true, judgeId: true, courtroomId: true },
      });
      const actual = conflicts.filter((h) => {
        const hEnd = new Date(h.scheduledAt.getTime() + h.durationMins * 60_000);
        return newStart < hEnd && newEnd > h.scheduledAt;
      });
      if (actual.length > 0) {
        const conflict = actual[0]!;
        const resource = conflict.judgeId === existing.judgeId ? "judge" : "courtroom";
        return reply.status(409).send({
          error: "CONFLICT",
          message: `Rescheduling conflict: the ${resource} is already booked at this time.`,
          conflictingHearingId: conflict.id,
        });
      }
    }

    const updateData: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.scheduledAt) updateData["scheduledAt"] = new Date(parsed.data.scheduledAt);

    const updated = await prisma.hearing.update({
      where: { id, caseId },
      data: updateData,
    });

    const courtId = caseRecord?.courtId ?? null;

    if (parsed.data.status && parsed.data.status !== existing.status) {
      await recordAuditLog({
        prisma,
        actor: { id: request.user.id, role: request.user.role },
        courtId,
        entityType: "HEARING",
        entityId: existing.id,
        action: "HEARING_STATUS_CHANGED",
        fromState: existing.status,
        toState: updated.status,
        changes: { status: { from: existing.status, to: updated.status } },
      });

      const statusEventMap: Partial<Record<string, "HEARING_RESCHEDULED" | "HEARING_CANCELLED" | "HEARING_COMPLETED">> = {
        ADJOURNED: "HEARING_RESCHEDULED",
        CANCELLED: "HEARING_CANCELLED",
        COMPLETED: "HEARING_COMPLETED",
      };
      const eventType = statusEventMap[updated.status];
      if (eventType) {
        dispatchCaseEvent(caseId, eventType, {
          hearingType: updated.type,
          scheduledAt: updated.scheduledAt.toLocaleString(),
        }).catch(() => {/* non-blocking */});
      }
    }

    await recordAuditLog({
      prisma,
      actor: { id: request.user.id, role: request.user.role },
      courtId,
      entityType: "HEARING",
      entityId: existing.id,
      action: "HEARING_UPDATED",
      fromState: null,
      toState: null,
      changes: parsed.data,
    });

    return reply.send({ data: updated });
  });

  // ── Mark hearing as no-show ────────────────────────────────────────────
  /**
   * POST /cases/:caseId/hearings/:id/no-show
   *
   * Records that one or both parties failed to appear for a SCHEDULED or
   * IN_PROGRESS hearing. Updates the hearing status to NO_SHOW and emits
   * an audit log entry. Accessible by ADMIN, CLERK, and JUDGE roles.
   */
  app.post<{ Params: { caseId: string; id: string } }>(
    "/cases/:caseId/hearings/:id/no-show",
    { preHandler: [requireAuth, requireTenantScope, requireRole("ADMIN", "CLERK", "JUDGE")] },
    async (request, reply) => {
      const { caseId, id } = request.params;

      const hearing = await prisma.hearing.findFirst({
        where: { id, caseId },
        select: {
          id: true,
          status: true,
          type: true,
          scheduledAt: true,
          case: { select: { id: true, title: true, courtId: true } },
        },
      });

      if (!hearing) {
        return reply.code(404).send({ error: "NOT_FOUND", message: "Hearing not found", statusCode: 404 });
      }

      // Enforce tenant scoping
      const userCourtId = request.user.courtId;
      if (userCourtId && hearing.case.courtId !== userCourtId) {
        return reply.code(403).send({ error: "FORBIDDEN", message: "Access denied: case belongs to a different court", statusCode: 403 });
      }

      if (hearing.status !== "SCHEDULED" && hearing.status !== "IN_PROGRESS") {
        return reply.code(400).send({
          error: "INVALID_STATUS",
          message: "Only SCHEDULED or IN_PROGRESS hearings can be marked as no-show.",
          statusCode: 400,
        });
      }

      await prisma.hearing.update({
        where: { id },
        data: { status: "NO_SHOW" },
      });

      await recordAuditLog({
        prisma,
        actor: { id: request.user.id, role: request.user.role },
        courtId: hearing.case.courtId,
        entityType: "HEARING",
        entityId: id,
        action: "HEARING_NO_SHOW",
        fromState: hearing.status,
        toState: "NO_SHOW",
        changes: { hearingType: hearing.type, scheduledAt: hearing.scheduledAt.toISOString() },
      });

      // Notify case subscribers about the no-show event
      dispatchCaseEvent(caseId, "CASE_STATUS_CHANGED", {
        hearingType: hearing.type,
        scheduledAt: hearing.scheduledAt.toLocaleString(),
      }).catch(() => {/* non-blocking */});

      return reply.send({ success: true });
    },
  );
}
