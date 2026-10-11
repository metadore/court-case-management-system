import type { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@tpt-court/database";
import type { JwtPayload, AuthUser } from "@tpt-court/types";
import crypto from "crypto";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtPayload;
    user: AuthUser;
  }
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.status(401).send({ error: "UNAUTHORIZED", message: "Invalid or missing token", statusCode: 401 });
  }

  const payload = request.user as unknown as JwtPayload;

  // Pending-TOTP tokens may only access the TOTP verify endpoint
  if (payload.totpPending === true && !request.url.includes("/totp/verify")) {
    return reply.status(401).send({ error: "TOTP_REQUIRED", message: "Two-factor authentication required to continue", statusCode: 401 });
  }

  const token = request.headers.authorization?.replace("Bearer ", "") ?? "";
  const tokenHash = token ? crypto.createHash("sha256").update(token).digest("hex") : null;

  // Run blacklist check and user load in parallel instead of sequentially
  const [blacklisted, user] = await Promise.all([
    tokenHash
      ? prisma.session.findUnique({ where: { tokenHash }, select: { id: true } })
      : null,
    prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        courtId: true,
        firstName: true,
        lastName: true,
        isActive: true,
        totpEnabled: true,
      },
    }),
  ]);

  if (blacklisted) {
    return reply.status(401).send({ error: "UNAUTHORIZED", message: "Token has been revoked", statusCode: 401 });
  }

  if (!user || !user.isActive) {
    return reply.status(401).send({ error: "UNAUTHORIZED", message: "User not found or deactivated", statusCode: 401 });
  }

  request.user = {
    id: user.id,
    email: user.email,
    role: user.role,
    courtId: user.courtId,
    firstName: user.firstName,
    lastName: user.lastName,
    totpEnabled: user.totpEnabled,
  };
}