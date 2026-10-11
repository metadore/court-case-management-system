import type { FastifyInstance } from "fastify";
import { prisma } from "@tpt-court/database";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { requireTenantScope, scopeWhere } from "../middleware/tenantScope.js";
import { z } from "zod";
import { recordAuditLog } from "../lib/audit.js";
import { dispatchCaseEvent } from "../notifications/dispatch.js";
import { getWorkflowConfig } from "../lib/workflow.js";

/** Statuses that require a closeReason and set closedAt on the case record. */
const TERMINAL_STATUSES = ["CLOSED", "DEFAULT", "DISMISSED_FOR_WANT_OF_PROSECUTION"] as const;

export default async function caseRoutes(app: FastifyInstance) {
  // ── Dashboard: List cases (filtered by role) ──────────────────────────
  app.get("/cases", { preHandler: [requireAuth, requireTenantScope] }, async (request, reply) => {
    const { status, type, q, page = "1", pageSize = "10" } = request.query as Record<string, string | undefined>;

    const pageNum = Math.max(1, Number(page));
    const limit = Math.min(100, Math.max(1, Number(pageSize)));

    const where: Record<string, unknown> = {};

    // C1 fix: apply tenant scoping
    const tenantFilter = scopeWhere(request);
    Object.assign(where, tenantFilter);

    if (request.user.role === "LAWYER" || request.user.role === "PUBLIC") {
      where["parties"] = { some: { userId: request.user.id } };
    }

    if (q && q.length >= 2) {
      where["OR"] = [
        { title: { contains: q, mode: "insensitive" } },
        { caseNumber: { contains: q, mode: "insensitive" } },
      ];
    }
    if (type) where["type"] = type;
    if (status) where["status"] = status;
    const { priority } = request.query as Record<string, string | undefined>;
    if (priority) where["priority"] = priority;

    const [data, total] = await Promise.all([
      prisma.case.findMany({
        where,
        select: {
          id: true,
          caseNumber: true,
          title: true,
          type: true,
          status: true,
          priority: true,
          filedAt: true,
          assignedJudge: { select: { firstName: true, lastName: true } },
        },
        skip: (pageNum - 1) * limit,
        take: limit,
        orderBy: [{ priority: "desc" }, { filedAt: "desc" }],
      }),
      prisma.case.count({ where }),
    ]);

    return reply.send({ data, total, page: pageNum, pageSize: limit, totalPages: Math.ceil(total / limit) });
  });

  // ── Bulk status update ─────────────────────────────────────────────────
  app.patch("/cases/bulk-status", { preHandler: [requireAuth, requireTenantScope, requireRole("ADMIN", "CLERK")] }, async (request, reply) => {
    const schema = z.object({
      caseIds: z.array(z.string()).min(1).max(100),
      status: z.enum(["FILED", "PENDING", "ACTIVE", "ADJOURNED", "DEFAULT", "DISMISSED_FOR_WANT_OF_PROSECUTION", "CLOSED", "ARCHIVED"]),
      closeReason: z.string().optional(),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "VALIDATION_ERROR", message: parsed.error.flatten() });
    }

    const { caseIds, status, closeReason } = parsed.data;
    const tenantFilter = scopeWhere(request);

    const updateData: Record<string, unknown> = { status };
    if ((TERMINAL_STATUSES as readonly string[]).includes(status)) {
      updateData["closeReason"] = closeReason ?? "OTHER";
      updateData["closedAt"] = new Date();
    }

    await prisma.case.updateMany({
      where: { id: { in: caseIds }, ...tenantFilter },
      data: updateData,
    });

    const courtId = request.user.courtId ?? null;

    for (const caseId of caseIds) {
      await recordAuditLog({
        prisma,
        actor: { id: request.user.id, role: request.user.role },
        courtId,
        entityType: "CASE",
        entityId: caseId,
        action: "BULK_STATUS_UPDATE",
        toState: status,
      });
    }

    return reply.send({ success: true, updated: caseIds.length });
  });

  // ── CSV export ─────────────────────────────────────────────────────────
  app.get("/cases/export", { preHandler: [requireAuth, requireTenantScope, requireRole("ADMIN", "CLERK", "JUDGE")] }, async (request, reply) => {
    const { status, type, q, priority, ids } = request.query as Record<string, string | undefined>;

    const where: Record<string, unknown> = {};
    const tenantFilter = scopeWhere(request);
    Object.assign(where, tenantFilter);

    if (q && q.length >= 2) {
      where["OR"] = [
        { title: { contains: q, mode: "insensitive" } },
        { caseNumber: { contains: q, mode: "insensitive" } },
      ];
    }
    if (type) where["type"] = type;
    if (status) where["status"] = status;
    if (priority) where["priority"] = priority;
    if (ids) {
      const idList = ids.split(",").filter(Boolean);
      if (idList.length > 0) where["id"] = { in: idList };
    }

    const cases = await prisma.case.findMany({
      where,
      select: {
        caseNumber: true,
        title: true,
        type: true,
        status: true,
        priority: true,
        filedAt: true,
        closedAt: true,
        assignedJudge: { select: { firstName: true, lastName: true } },
        _count: { select: { parties: true } },
      },
      orderBy: [{ priority: "desc" }, { filedAt: "desc" }],
    });

    // Build CSV manually
    const escape = (val: unknown): string => {
      const s = val == null ? "" : String(val);
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const headers = ["Case Number", "Title", "Type", "Status", "Priority", "Filed At", "Closed At", "Judge", "Parties Count"];
    const rows = cases.map((c) => [
      c.caseNumber,
      c.title,
      c.type,
      c.status,
      c.priority,
      c.filedAt.toISOString(),
      c.closedAt ? c.closedAt.toISOString() : "",
      c.assignedJudge ? `${c.assignedJudge.firstName} ${c.assignedJudge.lastName}` : "",
      c._count.parties,
    ]);

    const csv = [headers, ...rows].map((row) => row.map(escape).join(",")).join("\r\n");

    return reply
      .header("Content-Type", "text/csv")
      .header("Content-Disposition", 'attachment; filename="cases.csv"')
      .send(csv);
  });

  // ── Dashboard: Get single case ─────────────────────────────────────────
  app.get<{ Params: { id: string } }>("/cases/:id", { preHandler: [requireAuth, requireTenantScope] }, async (request, reply) => {
    const found = await prisma.case.findUnique({
      where: { id: request.params.id },
      include: {
        assignedJudge: { select: { id: true, firstName: true, lastName: true } },
        consolidatedInto: { select: { caseNumber: true, title: true } },
        parentCase: { select: { id: true, caseNumber: true, title: true } },
        appealCases: { select: { id: true, caseNumber: true, title: true, status: true } },
        parties: true,
        hearings: {
          select: {
            id: true,
            scheduledAt: true,
            durationMins: true,
            type: true,
            status: true,
            format: true,
            notes: true,
            continuedFromId: true,
            continuedFrom: { select: { id: true, scheduledAt: true, type: true } },
            judge: { select: { firstName: true, lastName: true } },
            courtroom: { select: { name: true } },
          },
          orderBy: { scheduledAt: "asc" },
        },
        documents: {
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
        },
      },
    });

    if (!found) {
      return reply.status(404).send({ error: "NOT_FOUND", message: "Case not found", statusCode: 404 });
    }

    // H4 fix: enforce access control per role
    const userCourtId = request.user.courtId;
    // C1 fix: enforce tenant scoping
    if (userCourtId && found.courtId !== userCourtId) {
      return reply.status(403).send({ error: "FORBIDDEN", message: "Access denied: case belongs to a different court", statusCode: 403 });
    }

    // H4 fix: LAWYER/PUBLIC must be a party to the case or the case must be public
    if (request.user.role === "LAWYER" || request.user.role === "PUBLIC") {
      if (!found.isPublic) {
        const party = found.parties.find(p => p.userId === request.user.id);
        if (!party) {
          return reply.status(403).send({ error: "FORBIDDEN", message: "Not a party to this case", statusCode: 403 });
        }
      }
    }

    return reply.send({ data: found });
  });

  // ── Create case ────────────────────────────────────────────────────────
  app.post("/cases", { preHandler: [requireAuth, requireTenantScope, requireRole("ADMIN", "CLERK")] }, async (request, reply) => {
    const schema = z.object({
      title: z.string().min(1).max(255),
      type: z.enum(["CIVIL", "CRIMINAL", "FAMILY", "PROBATE", "COMMERCIAL", "CONSTITUTIONAL", "APPELLATE", "OTHER"]),
      priority: z.enum(["STANDARD", "URGENT", "EMERGENCY"]).default("STANDARD"),
      description: z.string().max(10000).optional(),
      isPublic: z.boolean().default(true),
      tags: z.array(z.string().max(100)).max(50).default([]),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: parsed.error.message, statusCode: 400 });
    }

    if (!request.user.courtId) {
      return reply.status(400).send({ error: "NO_COURT", message: "Your account is not associated with a court.", statusCode: 400 });
    }

    const caseNumber = await generateCaseNumber();

    const created = await prisma.case.create({
      data: {
        caseNumber,
        courtId: request.user.courtId,
        title: parsed.data.title,
        type: parsed.data.type,
        priority: parsed.data.priority,
        description: parsed.data.description ?? null,
        isPublic: parsed.data.isPublic,
        tags: parsed.data.tags,
        createdById: request.user.id,
      },
    });

    const courtId = request.user.courtId ?? null;

    await recordAuditLog({
      prisma,
      actor: { id: request.user.id, role: request.user.role },
      courtId,
      entityType: "CASE",
      entityId: created.id,
      action: "CASE_CREATED",
      fromState: null,
      toState: created.status,
      changes: { title: created.title, type: created.type, caseNumber: created.caseNumber },
    });

    // Auto-apply filing fee based on jurisdiction workflow config
    try {
      const court = await prisma.court.findUnique({
        where: { id: created.courtId },
        select: { code: true },
      });
      const config = getWorkflowConfig(court?.code ?? "US");
      if (config.feeSchedule.filingFee > 0) {
        await prisma.payment.create({
          data: {
            caseId: created.id,
            amount: config.feeSchedule.filingFee * 100,
            currency: config.feeSchedule.currency ?? "USD",
            type: "FILING_FEE",
            status: "PENDING",
            description: "Filing fee",
          },
        });
      }
    } catch {
      // Non-blocking: fee creation failure should not prevent case creation
    }

    dispatchCaseEvent(created.id, "CASE_FILED", {}).catch(() => {/* non-blocking */});

    return reply.status(201).send({ data: created });
  });

  // ── Update case ────────────────────────────────────────────────────────
  app.patch<{ Params: { id: string } }>("/cases/:id", { preHandler: [requireAuth, requireTenantScope, requireRole("ADMIN", "CLERK", "JUDGE")] }, async (request, reply) => {
    const schema = z.object({
      title: z.string().min(1).max(255).optional(),
      type: z.enum(["CIVIL", "CRIMINAL", "FAMILY", "PROBATE", "COMMERCIAL", "CONSTITUTIONAL", "APPELLATE", "OTHER"]).optional(),
      status: z.enum(["FILED", "PENDING", "ACTIVE", "ADJOURNED", "DEFAULT", "DISMISSED_FOR_WANT_OF_PROSECUTION", "CLOSED", "ARCHIVED"]).optional(),
      priority: z.enum(["STANDARD", "URGENT", "EMERGENCY"]).optional(),
      description: z.string().max(10000).optional(),
      isPublic: z.boolean().optional(),
      tags: z.array(z.string().max(100)).max(50).optional(),
      assignedJudgeId: z.string().optional(),
      consolidatedIntoId: z.string().nullable().optional(),
      courtroomId: z.string().optional(),
      closeReason: z.enum(["JUDGMENT", "SETTLEMENT", "DISMISSAL", "DEFAULT_JUDGMENT", "WITHDRAWN", "TRANSFERRED", "OTHER"]).optional(),
      parentCaseId: z.string().nullable().optional(),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: parsed.error.message, statusCode: 400 });
    }

    const existing = await prisma.case.findUnique({ where: { id: request.params.id } });
    if (!existing) {
      return reply.status(404).send({ error: "NOT_FOUND", message: "Case not found", statusCode: 404 });
    }

    // C1 fix: enforce tenant scoping on update
    const userCourtId = request.user.courtId;
    if (userCourtId && existing.courtId !== userCourtId) {
      return reply.status(403).send({ error: "FORBIDDEN", message: "Access denied: case belongs to a different court", statusCode: 403 });
    }

    // Require closeReason when transitioning to any terminal status (CLOSED / DEFAULT / DISMISSED)
    if (
      (TERMINAL_STATUSES as readonly string[]).includes(parsed.data.status ?? "") &&
      parsed.data.status !== existing.status &&
      !parsed.data.closeReason
    ) {
      return reply.status(400).send({
        error: "CLOSE_REASON_REQUIRED",
        message: "A closeReason is required when closing a case. Allowed values: JUDGMENT, SETTLEMENT, DISMISSAL, DEFAULT_JUDGMENT, WITHDRAWN, TRANSFERRED, OTHER.",
        statusCode: 400,
      });
    }

    // Enforce valid status transitions
    if (parsed.data.status && parsed.data.status !== existing.status) {
      const ALLOWED: Record<string, string[]> = {
        FILED:    ["PENDING", "CLOSED", "DEFAULT"],
        PENDING:  ["ACTIVE", "CLOSED", "DEFAULT"],
        ACTIVE:   ["ADJOURNED", "CLOSED", "DEFAULT", "DISMISSED_FOR_WANT_OF_PROSECUTION"],
        ADJOURNED:["ACTIVE", "CLOSED", "DEFAULT"],
        DEFAULT:  ["CLOSED", "ARCHIVED"],
        DISMISSED_FOR_WANT_OF_PROSECUTION: ["CLOSED", "ARCHIVED"],
        CLOSED:   ["ARCHIVED"],
        ARCHIVED: [],
      };
      const allowed = ALLOWED[existing.status] ?? [];
      if (!allowed.includes(parsed.data.status)) {
        return reply.status(400).send({
          error: "INVALID_TRANSITION",
          message: `Cannot transition case from ${existing.status} to ${parsed.data.status}. Allowed next states: ${allowed.join(", ") || "none"}.`,
          statusCode: 400,
        });
      }
    }

    const updateData: Record<string, unknown> = { ...parsed.data };
    // Set closedAt when transitioning to any terminal status
    if (
      (TERMINAL_STATUSES as readonly string[]).includes(parsed.data.status ?? "") &&
      existing.status !== parsed.data.status
    ) {
      updateData["closedAt"] = new Date();
    }

    const updated = await prisma.case.update({
      where: { id: request.params.id },
      data: updateData,
    });

    const courtId = request.user.courtId ?? existing.courtId ?? null;

    if (parsed.data.status && parsed.data.status !== existing.status) {
      await recordAuditLog({
        prisma,
        actor: { id: request.user.id, role: request.user.role },
        courtId,
        entityType: "CASE",
        entityId: existing.id,
        action: "CASE_STATUS_CHANGED",
        fromState: existing.status,
        toState: updated.status,
        changes: { status: { from: existing.status, to: updated.status } },
      });

      dispatchCaseEvent(existing.id, "CASE_STATUS_CHANGED", {
        fromStatus: existing.status,
        toStatus: updated.status,
      }).catch(() => {/* non-blocking */});
    }

    await recordAuditLog({
      prisma,
      actor: { id: request.user.id, role: request.user.role },
      courtId,
      entityType: "CASE",
      entityId: existing.id,
      action: "CASE_UPDATED",
      fromState: null,
      toState: null,
      changes: parsed.data,
    });

    return reply.send({ data: updated });
  });

  // ── Audit log / case timeline ──────────────────────────────────────────
  app.get<{ Params: { id: string } }>("/cases/:id/audit-log", { preHandler: [requireAuth, requireTenantScope] }, async (request, reply) => {
    const { id } = request.params;

    const caseRecord = await prisma.case.findUnique({ where: { id }, select: { id: true, courtId: true } });
    if (!caseRecord) {
      return reply.status(404).send({ error: "NOT_FOUND", message: "Case not found", statusCode: 404 });
    }

    // C1 fix: enforce tenant scoping
    const userCourtId = request.user.courtId;
    if (userCourtId && caseRecord.courtId !== userCourtId) {
      return reply.status(403).send({ error: "FORBIDDEN", message: "Access denied: case belongs to a different court", statusCode: 403 });
    }

    const auditSelect = {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      fromState: true,
      toState: true,
      changes: true,
      actorUserId: true,
      actorRole: true,
      createdAt: true,
    } as const;

    const logs = await prisma.auditLog.findMany({
      where: { entityId: id, entityType: "CASE" },
      orderBy: { createdAt: "asc" },
      take: 200,
      select: auditSelect,
    });

    // Also include hearing and document events linked to this case
    const [hearingIds, documentIds] = await Promise.all([
      prisma.hearing.findMany({ where: { caseId: id }, select: { id: true } }).then((rows) => rows.map((r) => r.id)),
      prisma.document.findMany({ where: { caseId: id }, select: { id: true } }).then((rows) => rows.map((r) => r.id)),
    ]);

    const relatedLogs = hearingIds.length + documentIds.length > 0
      ? await prisma.auditLog.findMany({
          where: {
            entityId: { in: [...hearingIds, ...documentIds] },
            entityType: { in: ["HEARING", "DOCUMENT"] },
          },
          orderBy: { createdAt: "asc" },
          take: 200,
          select: auditSelect,
        })
      : [];

    const timeline = [...logs, ...relatedLogs].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    return reply.send({ data: timeline });
  });
}

/**
 * Generates a unique case number using a database transaction to avoid race conditions.
 * Format: YEAR-SEQUENCE (e.g., "2026-00001")
 */
async function generateCaseNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `${year}-`;

  // Use a transaction to atomically increment the sequence
  const result = await prisma.$transaction(async (tx) => {
    // Find the current max case number for this year
    const lastCase = await tx.case.findFirst({
      where: { caseNumber: { startsWith: prefix } },
      orderBy: { caseNumber: "desc" },
      select: { caseNumber: true },
    });

    let nextSeq = 1;
    if (lastCase) {
      const lastNum = parseInt(lastCase.caseNumber.replace(prefix, ""), 10);
      if (!isNaN(lastNum)) {
        nextSeq = lastNum + 1;
      }
    }

    return `${year}-${String(nextSeq).padStart(5, "0")}`;
  });

  return result;
}
