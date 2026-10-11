import type { FastifyInstance } from "fastify";
import { prisma } from "@tpt-court/database";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { requireTenantScope } from "../middleware/tenantScope.js";
import { generateCaseSummaryPdf } from "../lib/reports.js";

export default async function reportRoutes(app: FastifyInstance) {
  // ── Generate case summary PDF ──────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    "/reports/cases/:id/summary",
    { preHandler: [requireAuth, requireTenantScope, requireRole("ADMIN", "CLERK", "JUDGE")] },
    async (request, reply) => {
      const caseId = request.params.id;

      // Load case data with all relations
      const caseData = await prisma.case.findUnique({
        where: { id: caseId },
        include: {
          assignedJudge: { select: { firstName: true, lastName: true } },
          parties: true,
          hearings: {
            include: {
              judge: { select: { firstName: true, lastName: true } },
            },
            orderBy: { scheduledAt: "asc" },
          },
          documents: {
            include: {
              uploadedBy: { select: { firstName: true, lastName: true } },
            },
            orderBy: { createdAt: "desc" },
          },
        },
      });

      if (!caseData) {
        return reply.status(404).send({
          error: "NOT_FOUND",
          message: "Case not found",
          statusCode: 404,
        });
      }

      // C1 fix: enforce tenant scoping
      const userCourtId = request.user.courtId;
      if (userCourtId && caseData.courtId !== userCourtId) {
        return reply.status(403).send({
          error: "FORBIDDEN",
          message: "Access denied: case belongs to a different court",
          statusCode: 403,
        });
      }

      // Build docket entries from audit log
      const auditEntries = await prisma.auditLog.findMany({
        where: { entityType: "CASE", entityId: caseId },
        orderBy: { createdAt: "asc" },
        take: 200,
      });

      const docketEntries = auditEntries.map((entry) => ({
        date: entry.createdAt,
        type: entry.action,
        description: `Status changed from ${entry.fromState ?? "N/A"} to ${entry.toState ?? "N/A"}`,
        actor: `${entry.actorRole}:${entry.actorUserId}`,
      }));

      // Generate the PDF
      const pdfBuffer = await generateCaseSummaryPdf(
        {
          caseNumber: caseData.caseNumber,
          title: caseData.title,
          type: caseData.type,
          status: caseData.status,
          filedAt: caseData.filedAt,
          description: caseData.description,
          assignedJudge: caseData.assignedJudge,
          parties: caseData.parties.map((p) => ({
            name: p.name,
            role: p.role,
            email: p.email,
            phone: p.phone,
          })),
          hearings: caseData.hearings.map((h) => ({
            type: h.type,
            status: h.status,
            scheduledAt: h.scheduledAt,
            durationMins: h.durationMins,
            judge: h.judge ?? { firstName: "Unassigned", lastName: "" },
          })),
          documents: caseData.documents.map((d) => ({
            title: d.title,
            type: d.type,
            version: d.version,
            filedAt: d.createdAt,
            uploadedBy: d.uploadedBy,
          })),
        },
        docketEntries,
      );

      // Return the PDF
      reply.header("Content-Type", "application/pdf");
      reply.header(
        "Content-Disposition",
        `attachment; filename="case-${caseData.caseNumber}-summary.pdf"`,
      );
      return reply.send(pdfBuffer);
    },
  );
}