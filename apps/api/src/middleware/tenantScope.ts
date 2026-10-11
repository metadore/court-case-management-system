import type { FastifyRequest, FastifyReply } from "fastify";

/**
 * Middleware that enforces tenant (court) scoping for all data access.
 *
 * Strategy: Users with a courtId will only see data belonging to their court.
 * ADMIN users with no courtId see all courts (super-admin).
 *
 * This middleware attaches a `tenantScope` filter to the request that route
 * handlers can use to scope their Prisma queries.
 */
export async function requireTenantScope(request: FastifyRequest, _reply: FastifyReply) {
  // The tenant scope is derived from the authenticated user's courtId
  const user = request.user as { courtId?: string | null } | null;
  const courtId = user?.courtId ?? null;

  // Attach the scope for downstream route handlers to use
  (request as any).tenantScope = {
    courtId,
    // Whether this user is scoped to a specific court
    isScoped: Boolean(courtId),
    /**
     * Build a where clause to scope a query to the user's court.
     * For multi-tenant tables that have a courtId field.
     *
     * @param alias Optional table alias for raw queries
     */
    where: (alias?: string) => {
      if (!courtId) return {};
      const prefix = alias ? `${alias}.` : "";
      return { [`${prefix}courtId`]: courtId };
    },
  };
}

/**
 * Helper to get the tenant scope from a request.
 * Safe to call even if requireTenantScope wasn't run.
 */
export function getTenantScope(request: FastifyRequest): {
  courtId: string | null;
  isScoped: boolean;
} {
  const scope = (request as any).tenantScope as
    | { courtId: string | null; isScoped: boolean }
    | undefined;
  return scope ?? { courtId: null, isScoped: false };
}

/**
 * Apply tenant scoping to a Prisma query filter.
 * Merges the court filter with any existing filters.
 */
export function scopeWhere(
  request: FastifyRequest,
  existingWhere: Record<string, unknown> = {},
): Record<string, unknown> {
  const { courtId, isScoped } = getTenantScope(request);
  if (!isScoped || !courtId) return existingWhere;

  return {
    ...existingWhere,
    courtId,
  };
}

declare module "fastify" {
  interface FastifyRequest {
    tenantScope: {
      courtId: string | null;
      isScoped: boolean;
      where: (alias?: string) => Record<string, unknown>;
    };
  }
}