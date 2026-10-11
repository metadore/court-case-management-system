import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import type { JwtPayload } from "@tpt-court/types";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@tpt-court/database";
import { requireAuth } from "../middleware/requireAuth.js";
import { recordAuditLog } from "../lib/audit.js";
import crypto from "crypto";

const registerSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(["PUBLIC"]).optional().default("PUBLIC"), // M2 fix: only PUBLIC role allowed on registration
  courtId: z.string().optional(),
  barNumber: z.string().optional(),
  phone: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const authRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // POST /api/auth/register
  app.post("/register", async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "VALIDATION_ERROR",
        message: parsed.error.errors.map((e) => e.message).join(", "),
        statusCode: 400,
      });
    }

    const { email, password, firstName, lastName, role, courtId, barNumber, phone } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      // Return generic message to prevent user enumeration
      return reply.status(409).send({
        error: "CONFLICT",
        message: "Unable to complete registration. Please check your details and try again.",
        statusCode: 409,
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: { email, passwordHash, firstName, lastName, role, courtId, barNumber, phone },
      select: { id: true, email: true, role: true, firstName: true, lastName: true, courtId: true, createdAt: true },
    });

    const token = app.jwt.sign({ sub: user.id, email: user.email, role: user.role, courtId: user.courtId, firstName: user.firstName, lastName: user.lastName } as JwtPayload);

    return reply.status(201).send({ data: { user, token } });
  });

  // POST /api/auth/login
  app.post("/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "VALIDATION_ERROR",
        message: parsed.error.errors.map((e) => e.message).join(", "),
        statusCode: 400,
      });
    }

    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      // M7 fix: log failed auth attempt
      await recordAuditLog({
        prisma,
        actor: { id: "unknown", role: "PUBLIC" },
        courtId: null,
        entityType: "USER",
        entityId: "unknown",
        action: "LOGIN_FAILED",
        fromState: null,
        toState: null,
        changes: { email, reason: "USER_NOT_FOUND_OR_INACTIVE" },
      }).catch(() => {});
      return reply.status(401).send({ error: "UNAUTHORIZED", message: "Invalid credentials", statusCode: 401 });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      // M7 fix: log failed auth attempt
      await recordAuditLog({
        prisma,
        actor: { id: user.id, role: user.role },
        courtId: user.courtId ?? null,
        entityType: "USER",
        entityId: user.id,
        action: "LOGIN_FAILED",
        fromState: null,
        toState: null,
        changes: { reason: "INVALID_PASSWORD" },
      }).catch(() => {});
      return reply.status(401).send({ error: "UNAUTHORIZED", message: "Invalid credentials", statusCode: 401 });
    }

    // If 2FA is enabled, issue a short-lived pending token that only grants access
    // to POST /api/totp/verify. The full token is issued after TOTP is confirmed.
    if (user.totpEnabled) {
      const pendingToken = app.jwt.sign(
        { sub: user.id, email: user.email, role: user.role, courtId: user.courtId, firstName: user.firstName, lastName: user.lastName, totpPending: true } as JwtPayload,
        { expiresIn: "5m" },
      );
      return reply.send({
        data: {
          user: { id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName, courtId: user.courtId },
          token: pendingToken,
          totpRequired: true,
        },
      });
    }

    const token = app.jwt.sign({ sub: user.id, email: user.email, role: user.role, courtId: user.courtId, firstName: user.firstName, lastName: user.lastName } as JwtPayload);

    return reply.send({
      data: {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          firstName: user.firstName,
          lastName: user.lastName,
          courtId: user.courtId,
        },
        token,
      },
    });
  });

  // POST /api/auth/logout
  app.post("/logout", { preHandler: [requireAuth] }, async (request, reply) => {
    // Blacklist the current token by storing its hash in the Session table with an expiry (H2 fix)
    const token = request.headers.authorization?.replace("Bearer ", "") ?? "";
    if (token) {
      const decoded = app.jwt.decode(token) as any;
      const expiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      // Hash the token before storing to avoid plaintext JWTs in the database
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      await prisma.session.create({
        data: {
          userId: request.user.id,
          tokenHash,
          expiresAt,
        },
      }).catch(() => {
        // Silently ignore duplicate token hash entries
      });
    }

    return reply.send({ data: { message: "Logged out successfully" } });
  });

  // GET /api/auth/me
  app.get("/me", { preHandler: [requireAuth] }, async (request, reply) => {
    return reply.send({ data: request.user });
  });

  // POST /api/auth/admin/create-user (admin-only user creation with elevated roles)
  app.post("/admin/create-user", { preHandler: [requireAuth] }, async (request, reply) => {
    // This would normally require ADMIN role check - scaffold for future use
    return reply.status(403).send({ error: "FORBIDDEN", message: "Not implemented", statusCode: 403 });
  });
};

export default authRoutes;