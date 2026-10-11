import type { FastifyRequest, FastifyReply } from "fastify";
import type { UserRole } from "@tpt-court/types";

export function requireRole(...roles: UserRole[]) {
  return (request: FastifyRequest, reply: FastifyReply): void => {
    if (!request.user) {
      reply.status(401).send({ error: "UNAUTHORIZED", message: "Authentication required", statusCode: 401 });
      return;
    }

    if (!roles.includes(request.user.role)) {
      reply.status(403).send({ error: "FORBIDDEN", message: "Insufficient permissions", statusCode: 403 });
      return;
    }
  };
}