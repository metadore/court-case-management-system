import type { FastifyInstance } from "fastify";
import { prisma } from "@tpt-court/database";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import { requireTenantScope, scopeWhere } from "../../middleware/tenantScope.js";

export default async function analyticsRoutes(app: FastifyInstance) {
  const guard = { preHandler: [requireAuth, requireTenantScope, requireRole("ADMIN", "JUDGE")] };

  // ── Overview stats ─────────────────────────────────────────────────────
  app.get("/analytics/overview", guard, async (request, reply) => {
    const tenantFilter = scopeWhere(request);
    const courtFilter = tenantFilter.courtId ? { courtId: tenantFilter.courtId as string } : {};

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const [
      totalCases,
      activeCases,
      closedThisMonth,
      filedThisMonth,
      closedCasesForAvg,
      casesByStatus,
      casesByType,
      casesByPriority,
      hearingsToday,
      overdueDeadlines,
      pendingFeeWaivers,
      unservedParties,
    ] = await Promise.all([
      prisma.case.count({ where: courtFilter }),
      prisma.case.count({ where: { ...courtFilter, status: { in: ["FILED", "PENDING", "ACTIVE", "ADJOURNED"] } } }),
      prisma.case.count({
        where: {
          ...courtFilter,
          status: "CLOSED",
          closedAt: { gte: startOfMonth, lte: endOfMonth },
        },
      }),
      prisma.case.count({
        where: {
          ...courtFilter,
          filedAt: { gte: startOfMonth, lte: endOfMonth },
        },
      }),
      prisma.case.findMany({
        where: { ...courtFilter, status: "CLOSED", closedAt: { not: null } },
        select: { filedAt: true, closedAt: true },
      }),
      prisma.case.groupBy({
        by: ["status"],
        where: courtFilter,
        _count: { _all: true },
      }),
      prisma.case.groupBy({
        by: ["type"],
        where: courtFilter,
        _count: { _all: true },
      }),
      prisma.case.groupBy({
        by: ["priority"],
        where: courtFilter,
        _count: { _all: true },
      }),
      prisma.hearing.count({
        where: {
          case: courtFilter.courtId ? { courtId: courtFilter.courtId } : {},
          scheduledAt: { gte: todayStart, lte: todayEnd },
          status: { in: ["SCHEDULED", "IN_PROGRESS"] },
        },
      }),
      (prisma as any).deadline.count({
        where: {
          case: courtFilter.courtId ? { courtId: courtFilter.courtId } : {},
          dueDate: { lt: now },
          completedAt: null,
        },
      }),
      (prisma as any).feeWaiverApplication.count({
        where: {
          case: courtFilter.courtId ? { courtId: courtFilter.courtId } : {},
          status: "PENDING",
        },
      }),
      prisma.party.count({
        where: {
          servedAt: null,
          case: {
            ...courtFilter,
            status: "ACTIVE",
          },
        },
      }),
    ]);

    // Calculate avg days to close
    let avgDaysToClose = 0;
    if (closedCasesForAvg.length > 0) {
      const totalMs = closedCasesForAvg.reduce((sum, c) => {
        if (!c.closedAt) return sum;
        return sum + (c.closedAt.getTime() - c.filedAt.getTime());
      }, 0);
      avgDaysToClose = Math.round(totalMs / closedCasesForAvg.length / (1000 * 60 * 60 * 24));
    }

    return reply.send({
      data: {
        totalCases,
        activeCases,
        closedThisMonth,
        filedThisMonth,
        avgDaysToClose,
        casesByStatus: casesByStatus.map((r) => ({ status: r.status, count: r._count._all })),
        casesByType: casesByType.map((r) => ({ type: r.type, count: r._count._all })),
        casesByPriority: casesByPriority.map((r) => ({ priority: r.priority, count: r._count._all })),
        hearingsToday,
        overdueDeadlines,
        pendingFeeWaivers,
        unservedParties,
      },
    });
  });

  // ── Case aging buckets ─────────────────────────────────────────────────
  app.get("/analytics/aging", guard, async (request, reply) => {
    const tenantFilter = scopeWhere(request);
    const courtFilter = tenantFilter.courtId ? { courtId: tenantFilter.courtId as string } : {};

    const now = new Date();

    const activeCases = await prisma.case.findMany({
      where: {
        ...courtFilter,
        status: { notIn: ["CLOSED", "ARCHIVED"] },
      },
      select: { filedAt: true },
    });

    const buckets = [
      { label: "0-30 days", count: 0 },
      { label: "31-90 days", count: 0 },
      { label: "91-180 days", count: 0 },
      { label: "180+ days", count: 0 },
    ];

    for (const c of activeCases) {
      const ageDays = Math.floor((now.getTime() - c.filedAt.getTime()) / (1000 * 60 * 60 * 24));
      if (ageDays <= 30) {
        buckets[0]!.count++;
      } else if (ageDays <= 90) {
        buckets[1]!.count++;
      } else if (ageDays <= 180) {
        buckets[2]!.count++;
      } else {
        buckets[3]!.count++;
      }
    }

    return reply.send({ data: { buckets } });
  });

  // ── Judge workload ─────────────────────────────────────────────────────
  app.get("/analytics/judge-workload", guard, async (request, reply) => {
    const tenantFilter = scopeWhere(request);
    const courtFilter = tenantFilter.courtId ? { courtId: tenantFilter.courtId as string } : {};

    // Get all judges for this court
    const judges = await prisma.user.findMany({
      where: {
        role: "JUDGE",
        ...(courtFilter.courtId ? { courtId: courtFilter.courtId as string } : {}),
      },
      select: { id: true, firstName: true, lastName: true },
    });

    const now = new Date();
    const judgeIds = judges.map((j) => j.id);

    const [caseGroups, hearingGroups, deadlineGroups] = await Promise.all([
      prisma.case.groupBy({
        by: ["assignedJudgeId"],
        where: { ...courtFilter, assignedJudgeId: { in: judgeIds }, status: { in: ["FILED", "PENDING", "ACTIVE", "ADJOURNED"] } },
        _count: { _all: true },
      }),
      prisma.hearing.groupBy({
        by: ["judgeId"],
        where: { judgeId: { in: judgeIds }, scheduledAt: { gte: now }, status: { in: ["SCHEDULED"] } },
        _count: { _all: true },
      }),
      prisma.deadline.groupBy({
        by: ["caseId"],
        where: { dueDate: { lt: now }, completedAt: null, case: { ...courtFilter, assignedJudgeId: { in: judgeIds } } },
        _count: { _all: true },
      }),
    ]);

    // Resolve overdue deadlines per judge by joining through case
    const overdueDeadlineCaseIds = deadlineGroups.map((d) => d.caseId);
    const caseJudgeMap = overdueDeadlineCaseIds.length > 0
      ? await prisma.case.findMany({ where: { id: { in: overdueDeadlineCaseIds } }, select: { id: true, assignedJudgeId: true } })
      : [];
    const overdueByJudge = new Map<string, number>();
    for (const c of caseJudgeMap) {
      if (!c.assignedJudgeId) continue;
      const dl = deadlineGroups.find((d) => d.caseId === c.id);
      if (dl) overdueByJudge.set(c.assignedJudgeId, (overdueByJudge.get(c.assignedJudgeId) ?? 0) + dl._count._all);
    }

    const caseCountMap   = new Map(caseGroups.map((g)    => [g.assignedJudgeId, g._count._all]));
    const hearingCountMap = new Map(hearingGroups.map((g) => [g.judgeId, g._count._all]));

    const results = judges.map((judge) => ({
      judgeId: judge.id,
      firstName: judge.firstName,
      lastName: judge.lastName,
      activeCases:       caseCountMap.get(judge.id)    ?? 0,
      scheduledHearings: hearingCountMap.get(judge.id) ?? 0,
      overdueDeadlines:  overdueByJudge.get(judge.id)  ?? 0,
    }));

    return reply.send({ data: results });
  });

  // ── Resolution trend (last 12 months) ─────────────────────────────────
  app.get("/analytics/resolution-trend", guard, async (request, reply) => {
    const tenantFilter = scopeWhere(request);
    const courtFilter = tenantFilter.courtId ? { courtId: tenantFilter.courtId as string } : {};

    const now = new Date();
    const windowStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    const [filedCases, closedCases] = await Promise.all([
      prisma.case.findMany({ where: { ...courtFilter, filedAt: { gte: windowStart } }, select: { filedAt: true } }),
      prisma.case.findMany({ where: { ...courtFilter, status: "CLOSED", closedAt: { gte: windowStart, not: null } }, select: { closedAt: true } }),
    ]);

    const months: Array<{ month: string; filed: number; closed: number }> = [];
    for (let i = 11; i >= 0; i--) {
      const date  = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year  = date.getFullYear();
      const month = date.getMonth();
      const start = new Date(year, month, 1);
      const end   = new Date(year, month + 1, 0, 23, 59, 59, 999);
      const label = `${year}-${String(month + 1).padStart(2, "0")}`;
      months.push({
        month:  label,
        filed:  filedCases.filter((c) => c.filedAt  >= start && c.filedAt  <= end).length,
        closed: closedCases.filter((c) => c.closedAt! >= start && c.closedAt! <= end).length,
      });
    }

    return reply.send({ data: months });
  });
}
