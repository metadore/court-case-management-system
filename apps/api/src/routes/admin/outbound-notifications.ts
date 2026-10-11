import type { FastifyInstance } from "fastify";
import { prisma } from "@tpt-court/database";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";

export default async function outboundNotificationRoutes(app: FastifyInstance) {
  const guard = { preHandler: [requireAuth, requireRole("ADMIN")] };

  // ── List outbound notifications (paginated, filterable) ─────────────────
  app.get("/", guard, async (request, reply) => {
    const q = request.query as Record<string, string | undefined>;
    const page     = Math.max(1, Number(q["page"] ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(q["pageSize"] ?? 25)));
    const status   = q["status"];
    const channel  = q["channel"];
    const caseId   = q["caseId"];

    const where: Record<string, unknown> = {};
    if (status)  where["status"]  = status;
    if (channel) where["channel"] = channel;
    if (caseId)  where["caseId"]  = caseId;

    const [data, total] = await Promise.all([
      prisma.outboundNotification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.outboundNotification.count({ where }),
    ]);

    return reply.send({ data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  });

  // ── Manual retry for a failed notification ──────────────────────────────
  app.post<{ Params: { id: string } }>("/:id/retry", guard, async (request, reply) => {
    const item = await prisma.outboundNotification.findUnique({ where: { id: request.params.id } });
    if (!item) return reply.status(404).send({ error: "NOT_FOUND", message: "Notification not found", statusCode: 404 });
    if (item.status !== "FAILED" && item.status !== "CANCELLED") {
      return reply.status(400).send({ error: "INVALID_STATE", message: "Only FAILED or CANCELLED notifications can be retried", statusCode: 400 });
    }

    const updated = await prisma.outboundNotification.update({
      where: { id: item.id },
      data: { status: "PENDING", attempts: 0, scheduledAt: new Date(), providerError: null, nextRetryAt: null },
    });

    return reply.send({ data: updated });
  });

  // ── Cancel a pending notification ───────────────────────────────────────
  app.post<{ Params: { id: string } }>("/:id/cancel", guard, async (request, reply) => {
    const item = await prisma.outboundNotification.findUnique({ where: { id: request.params.id } });
    if (!item) return reply.status(404).send({ error: "NOT_FOUND", message: "Notification not found", statusCode: 404 });
    if (item.status !== "PENDING") {
      return reply.status(400).send({ error: "INVALID_STATE", message: "Only PENDING notifications can be cancelled", statusCode: 400 });
    }

    const updated = await prisma.outboundNotification.update({
      where: { id: item.id },
      data: { status: "CANCELLED" },
    });

    return reply.send({ data: updated });
  });

  // ── Delivery stats summary ──────────────────────────────────────────────
  app.get("/stats", guard, async (_request, reply) => {
    const counts = await prisma.outboundNotification.groupBy({
      by: ["status"],
      _count: { _all: true },
    });

    const stats = Object.fromEntries(counts.map((r) => [r.status, r._count._all]));
    return reply.send({ data: stats });
  });
}
