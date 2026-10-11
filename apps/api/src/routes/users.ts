import type { FastifyInstance } from "fastify";
import { prisma } from "@tpt-court/database";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import bcrypt from "bcryptjs";
import { recordAuditLog } from "../lib/audit.js";
import { z } from "zod";



export default async function userRoutes(app: FastifyInstance) {
  // ── Get own profile ────────────────────────────────────────────────────
  app.get("/users/me", { preHandler: [requireAuth] }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        courtId: true,
        isActive: true,
        createdAt: true,
      },
    });

    if (!user) {
      return reply.status(404).send({ error: "NOT_FOUND", message: "User not found", statusCode: 404 });
    }

    return reply.send({ data: user });
  });

  // ── Update own profile ─────────────────────────────────────────────────
  app.patch("/users/me", { preHandler: [requireAuth] }, async (request, reply) => {
    const schema = z.object({
      firstName: z.string().min(1).max(100).optional(),
      lastName: z.string().min(1).max(100).optional(),
      email: z.string().email().optional(),
      currentPassword: z.string().optional(),
      // L3 fix: enforce same password policy as registration for newPassword
      newPassword: z
        .string()
        .min(8, "Password must be at least 8 characters")
        .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
        .regex(/[a-z]/, "Password must contain at least one lowercase letter")
        .regex(/[0-9]/, "Password must contain at least one number")
        .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character")
        .optional(),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: parsed.error.message, statusCode: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.firstName) updateData["firstName"] = parsed.data.firstName;
    if (parsed.data.lastName) updateData["lastName"] = parsed.data.lastName;

    const isChangingEmail = !!parsed.data.email;
    const isChangingPassword = !!parsed.data.newPassword;

    // Email and password changes both require current password verification
    if (isChangingEmail || isChangingPassword) {
      if (!parsed.data.currentPassword) {
        return reply.status(400).send({ error: "VALIDATION_ERROR", message: "Current password is required to change email or password", statusCode: 400 });
      }

      const user = await prisma.user.findUnique({ where: { id: request.user.id } });
      if (!user) {
        return reply.status(404).send({ error: "NOT_FOUND", message: "User not found", statusCode: 404 });
      }

      const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
      if (!valid) {
        return reply.status(403).send({ error: "FORBIDDEN", message: "Current password is incorrect", statusCode: 403 });
      }

      if (isChangingEmail) updateData["email"] = parsed.data.email;
      if (isChangingPassword) {
        updateData["passwordHash"] = await bcrypt.hash(parsed.data.newPassword!, 12);
      }
    }

    let passwordChanged = isChangingPassword;

    const updated = await prisma.user.update({
      where: { id: request.user.id },
      data: updateData,
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        courtId: true,
        isActive: true,
      },
    });

    const courtId = updated.courtId ?? null;

    // Strip sensitive data before logging
    const auditChanges = { ...updateData };
    delete auditChanges["passwordHash"];

    await recordAuditLog({
      prisma,
      actor: { id: request.user.id, role: request.user.role },
      courtId,
      entityType: "USER",
      entityId: request.user.id,
      action: passwordChanged ? "USER_PROFILE_UPDATED_WITH_PASSWORD_CHANGE" : "USER_PROFILE_UPDATED",
      fromState: null,
      toState: null,
      changes: auditChanges,
    });

    return reply.send({ data: updated });
  });

  // ── List users (admin only) ────────────────────────────────────────────

  app.get("/users", { preHandler: [requireAuth, requireRole("ADMIN")] }, async (request, reply) => {
    const page = Math.max(1, Number((request.query as Record<string, string>).page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number((request.query as Record<string, string>).pageSize ?? 20)));

    // Scope to the admin's own court; null courtId = super-admin, sees all users
    const courtFilter = request.user.courtId ? { courtId: request.user.courtId } : {};

    const [data, total] = await Promise.all([
      prisma.user.findMany({
        where: courtFilter,
        select: {
          id: true,
          email: true,
          role: true,
          firstName: true,
          lastName: true,
          courtId: true,
          isActive: true,
          createdAt: true,
          court: { select: { id: true, name: true } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.count({ where: courtFilter }),
    ]);

    return reply.send({ data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  });

  // ── Update user (admin only) ───────────────────────────────────────────
  app.patch<{ Params: { id: string } }>("/users/:id", { preHandler: [requireAuth, requireRole("ADMIN")] }, async (request, reply) => {
    const schema = z.object({
      isActive: z.boolean().optional(),
      role: z.enum(["ADMIN", "JUDGE", "CLERK", "LAWYER", "PUBLIC"]).optional(),
      firstName: z.string().min(1).max(100).optional(),
      lastName: z.string().min(1).max(100).optional(),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: parsed.error.message, statusCode: 400 });
    }

    const target = await prisma.user.findUnique({ where: { id: request.params.id } });
    if (!target) {
      return reply.status(404).send({ error: "NOT_FOUND", message: "User not found", statusCode: 404 });
    }

    // Admins can only manage users in their own court
    if (request.user.courtId && target.courtId !== request.user.courtId) {
      return reply.status(403).send({ error: "FORBIDDEN", message: "Access denied: user belongs to a different court", statusCode: 403 });
    }

    const updated = await prisma.user.update({
      where: { id: request.params.id },
      data: parsed.data,
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        courtId: true,
        isActive: true,
        createdAt: true,
      },
    });

    await recordAuditLog({
      prisma,
      actor: { id: request.user.id, role: request.user.role },
      courtId: request.user.courtId ?? null,
      entityType: "USER",
      entityId: updated.id,
      action: "USER_UPDATED_BY_ADMIN",
      fromState: null,
      toState: null,
      changes: parsed.data,
    });

    return reply.send({ data: updated });
  });

  // Also support PUT for backward-compat with the admin page toggle
  app.put<{ Params: { id: string } }>("/users/:id", { preHandler: [requireAuth, requireRole("ADMIN")] }, async (request, reply) => {
    const schema = z.object({
      isActive: z.boolean().optional(),
      role: z.enum(["ADMIN", "JUDGE", "CLERK", "LAWYER", "PUBLIC"]).optional(),
      firstName: z.string().min(1).max(100).optional(),
      lastName: z.string().min(1).max(100).optional(),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: parsed.error.message, statusCode: 400 });
    }

    const target = await prisma.user.findUnique({ where: { id: request.params.id } });
    if (!target) {
      return reply.status(404).send({ error: "NOT_FOUND", message: "User not found", statusCode: 404 });
    }

    if (request.user.courtId && target.courtId !== request.user.courtId) {
      return reply.status(403).send({ error: "FORBIDDEN", message: "Access denied: user belongs to a different court", statusCode: 403 });
    }

    const updated = await prisma.user.update({
      where: { id: request.params.id },
      data: parsed.data,
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        courtId: true,
        isActive: true,
        createdAt: true,
      },
    });

    await recordAuditLog({
      prisma,
      actor: { id: request.user.id, role: request.user.role },
      courtId: request.user.courtId ?? null,
      entityType: "USER",
      entityId: updated.id,
      action: "USER_UPDATED_BY_ADMIN",
      fromState: null,
      toState: null,
      changes: parsed.data,
    });

    return reply.send({ data: updated });
  });
}