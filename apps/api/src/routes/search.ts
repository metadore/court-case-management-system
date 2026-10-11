import type { FastifyInstance } from "fastify";
import { prisma } from "@tpt-court/database";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireTenantScope, scopeWhere } from "../middleware/tenantScope.js";
import { searchCases } from "../lib/search.js";
import { z } from "zod";

const searchSchema = z.object({
  q: z.string().min(2, "Search query must be at least 2 characters"),
  status: z.string().optional(),
  type: z.string().optional(),
  judgeId: z.string().optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateFrom must be YYYY-MM-DD").optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateTo must be YYYY-MM-DD").optional(),
  partyName: z.string().optional(),
  isPublic: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(10),
});

export default async function searchRoutes(app: FastifyInstance) {
  // ── Advanced case search ─────────────────────────────────────────────────
  app.get("/search/cases", { preHandler: [requireAuth, requireTenantScope] }, async (request, reply) => {
    // C2 fix: Add Zod validation for search parameters
    const parsed = searchSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "VALIDATION_ERROR",
        message: parsed.error.errors.map((e) => e.message).join(", "),
        statusCode: 400,
      });
    }

    const { q, status, type, judgeId, dateFrom, dateTo, partyName, isPublic, page, pageSize } = parsed.data;

    const result = await searchCases({
      q: q.trim(),
      status,
      type,
      judgeId,
      dateFrom,
      dateTo,
      partyName,
      isPublic: isPublic === "true" ? true : isPublic === "false" ? false : undefined,
      page,
      pageSize,
    });

    return reply.send(result);
  });

  // ── Party / person autocomplete search ───────────────────────────────────
  /**
   * GET /search/parties?q=<query>
   *
   * Returns up to 10 existing party records (by name) and up to 10 user
   * accounts matching the query. Used to pre-fill the Add Party form on the
   * case detail page. Requires at least 2 characters to avoid full-table scans.
   */
  app.get("/search/parties", { preHandler: [requireAuth, requireTenantScope] }, async (request, reply) => {
    const { q } = request.query as { q?: string };

    if (!q || q.trim().length < 2) {
      return reply.send({ users: [], parties: [] });
    }

    const query = q.trim();
    const tenantFilter = scopeWhere(request);

    // Search users (potential parties) by first name, last name, or email
    const users = await prisma.user.findMany({
      where: {
        ...(tenantFilter.courtId ? { courtId: tenantFilter.courtId } : {}),
        OR: [
          { firstName: { contains: query, mode: "insensitive" } },
          { lastName: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        phone: true,
      },
      take: 10,
    });

    // Search existing party records by name (distinct names to avoid duplicates)
    const parties = await prisma.party.findMany({
      where: {
        case: tenantFilter.courtId ? { courtId: tenantFilter.courtId } : {},
        name: { contains: query, mode: "insensitive" },
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
      },
      distinct: ["name"],
      take: 10,
    });

    return reply.send({ users, parties });
  });
}
