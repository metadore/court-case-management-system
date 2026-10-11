import type { FastifyInstance } from "fastify";
import { prisma } from "@tpt-court/database";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import { requireTenantScope, scopeWhere } from "../../middleware/tenantScope.js";

export default async function adminFeeWaiverRoutes(app: FastifyInstance) {
  // ── List all fee waiver applications across all cases ─────────────────
  app.get(
    "/admin/fee-waivers",
    { preHandler: [requireAuth, requireRole("ADMIN", "CLERK"), requireTenantScope] },
    async (request, reply) => {
      const { status, page = "1", pageSize = "20" } = request.query as Record<string, string | undefined>;
      const pageNum = Math.max(1, Number(page));
      const limit = Math.min(100, Math.max(1, Number(pageSize)));
      const tenantFilter = scopeWhere(request);

      const where: Record<string, unknown> = {};
      if (status) where["status"] = status;
      if (tenantFilter.courtId) {
        where["case"] = { courtId: tenantFilter.courtId };
      }

      const [items, total] = await Promise.all([
        (prisma as any).feeWaiverApplication.findMany({
          where,
          include: {
            case: { select: { id: true, caseNumber: true, title: true } },
            applicant: { select: { id: true, firstName: true, lastName: true, email: true } },
            reviewedBy: { select: { firstName: true, lastName: true } },
          },
          skip: (pageNum - 1) * limit,
          take: limit,
          orderBy: { createdAt: "desc" },
        }),
        (prisma as any).feeWaiverApplication.count({ where }),
      ]);

      return reply.send({
        data: items,
        total,
        page: pageNum,
        pageSize: limit,
        totalPages: Math.ceil(total / limit),
      });
    }
  );

  // ── Get single fee waiver ─────────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    "/admin/fee-waivers/:id",
    { preHandler: [requireAuth, requireRole("ADMIN", "CLERK"), requireTenantScope] },
    async (request, reply) => {
      const item = await (prisma as any).feeWaiverApplication.findUnique({
        where: { id: request.params.id },
        include: {
          case: { select: { id: true, caseNumber: true, title: true } },
          applicant: { select: { id: true, firstName: true, lastName: true, email: true } },
          reviewedBy: { select: { firstName: true, lastName: true } },
        },
      });
      if (!item) return reply.status(404).send({ error: "Not found" });
      return reply.send({ data: item });
    }
  );

  // ── Review a fee waiver (approve/deny) ────────────────────────────────
  app.patch<{ Params: { id: string }; Body: { status: string; reviewNotes?: string } }>(
    "/admin/fee-waivers/:id/review",
    { preHandler: [requireAuth, requireRole("ADMIN", "CLERK"), requireTenantScope] },
    async (request, reply) => {
      const { status, reviewNotes } = request.body;
      if (!["APPROVED", "DENIED"].includes(status)) {
        return reply.status(400).send({ error: "status must be APPROVED or DENIED" });
      }

      const item = await (prisma as any).feeWaiverApplication.findUnique({
        where: { id: request.params.id },
      });
      if (!item) return reply.status(404).send({ error: "Not found" });
      if (item.status !== "PENDING") {
        return reply.status(400).send({ error: "Application has already been reviewed" });
      }

      const updated = await (prisma as any).feeWaiverApplication.update({
        where: { id: request.params.id },
        data: {
          status,
          reviewNotes: reviewNotes ?? null,
          reviewedById: request.user.id,
          reviewedAt: new Date(),
        },
      });

      // If approved, mark PENDING FILING_FEE payments for this case as waived
      if (status === "APPROVED") {
        await prisma.payment.updateMany({
          where: {
            caseId: item.caseId,
            type: "FILING_FEE",
            status: "PENDING",
          },
          data: { status: "REFUNDED", description: "Fee waived — approved application" },
        });
      }

      return reply.send({ data: updated });
    }
  );
}
