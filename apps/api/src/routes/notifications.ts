import type { FastifyInstance } from "fastify";
import { prisma } from "@tpt-court/database";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { recordAuditLog } from "../lib/audit.js";
import { z } from "zod";

export default async function notificationRoutes(app: FastifyInstance) {

  // ── List notifications ─────────────────────────────────────────────────
  app.get("/", { preHandler: [requireAuth] }, async (request, reply) => {
    const page = Math.max(1, Number((request.query as Record<string, string>).page ?? 1));
    const pageSize = Math.min(50, Math.max(1, Number((request.query as Record<string, string>).pageSize ?? 20)));

    const userId = request.user.id;

    const [data, total] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.notification.count({ where: { userId } }),
    ]);

    return reply.send({ data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  });

  // ── Mark notification as read ──────────────────────────────────────────
  app.patch<{ Params: { id: string } }>("/:id/read", { preHandler: [requireAuth] }, async (request, reply) => {
    const notif = await prisma.notification.findUnique({
      where: { id: request.params.id },
    });

    if (!notif || notif.userId !== request.user.id) {
      return reply.status(404).send({ error: "NOT_FOUND", message: "Notification not found", statusCode: 404 });
    }

    const updated = await prisma.notification.update({
      where: { id: request.params.id },
      data: { isRead: true },
    });

    await recordAuditLog({
      prisma,
      actor: { id: request.user.id, role: request.user.role },
      courtId: null,
      entityType: "NOTIFICATION",
      entityId: updated.id,
      action: "NOTIFICATION_READ",
      fromState: "UNREAD",
      toState: "READ",
      changes: { isRead: { from: false, to: true } },
      requestId: request.id as string,
    });

    return reply.send({ data: updated });
  });

  // ── Mark all as read ───────────────────────────────────────────────────
  app.post("/read-all", { preHandler: [requireAuth] }, async (request, reply) => {
    const userId = request.user.id;

    const updatedMany = await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    if (updatedMany.count > 0) {
      await recordAuditLog({
        prisma,
        actor: { id: request.user.id, role: request.user.role },
        courtId: null,
        entityType: "NOTIFICATION",
        entityId: request.user.id,
        action: "NOTIFICATIONS_READ_ALL",
        fromState: null,
        toState: null,
        changes: { updatedCount: updatedMany.count },
        requestId: request.id as string,
      });
    }

    return reply.send({ success: true });

  });

  // ── Unread count ───────────────────────────────────────────────────────
  app.get("/unread-count", { preHandler: [requireAuth] }, async (request, reply) => {
    const count = await prisma.notification.count({
      where: { userId: request.user.id, isRead: false },
    });
    return reply.send({ data: count });
  });

  // ── Send notification (admin only) ────────────────────────────────────
  app.post("/", { preHandler: [requireAuth, requireRole("ADMIN")] }, async (request, reply) => {
    const schema = z.object({
      userId: z.string(),
      title:  z.string().min(1).max(200),
      body:   z.string().min(1).max(2000),
      type:   z.string().default("ADMIN_MESSAGE"),
      caseId: z.string().optional(),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: parsed.error.message, statusCode: 400 });
    }
    const target = await prisma.user.findUnique({ where: { id: parsed.data.userId }, select: { id: true } });
    if (!target) {
      return reply.status(404).send({ error: "NOT_FOUND", message: "User not found", statusCode: 404 });
    }
    const notif = await prisma.notification.create({
      data: {
        userId: parsed.data.userId,
        title:  parsed.data.title,
        body:   parsed.data.body,
        type:   parsed.data.type,
        caseId: parsed.data.caseId ?? null,
      },
    });
    await recordAuditLog({
      prisma,
      actor: { id: request.user.id, role: request.user.role },
      courtId: null,
      entityType: "NOTIFICATION",
      entityId: notif.id,
      action: "NOTIFICATION_SENT",
      fromState: null,
      toState: null,
      changes: { toUserId: parsed.data.userId, title: parsed.data.title },
      requestId: request.id as string,
    });
    return reply.status(201).send({ data: notif });
  });

  // ── Delete notification (own or admin) ────────────────────────────────
  app.delete<{ Params: { id: string } }>("/:id", { preHandler: [requireAuth] }, async (request, reply) => {
    const notif = await prisma.notification.findUnique({ where: { id: request.params.id } });
    if (!notif) {
      return reply.status(404).send({ error: "NOT_FOUND", message: "Notification not found", statusCode: 404 });
    }
    if (notif.userId !== request.user.id && request.user.role !== "ADMIN") {
      return reply.status(403).send({ error: "FORBIDDEN", message: "Not authorized", statusCode: 403 });
    }
    await prisma.notification.delete({ where: { id: request.params.id } });
    return reply.status(204).send();
  });

  // ── List all notifications (admin) ────────────────────────────────────
  app.get("/all", { preHandler: [requireAuth, requireRole("ADMIN")] }, async (request, reply) => {
    const page     = Math.max(1, Number((request.query as Record<string, string>).page ?? 1));
    const pageSize = Math.min(50, Math.max(1, Number((request.query as Record<string, string>).pageSize ?? 20)));
    const userId   = (request.query as Record<string, string>).userId;
    const where = userId ? { userId } : {};
    const [data, total] = await Promise.all([
      prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize,
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } }),
      prisma.notification.count({ where }),
    ]);
    return reply.send({ data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  });
}