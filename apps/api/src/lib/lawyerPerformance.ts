import { prisma } from "@tpt-court/database";

export interface LawyerPerformanceMetrics {
  caseStats: {
    total: number;
    active: number;
    closed: number;
    averageDurationDays: number | null;
    byType: { type: string; count: number }[];
    overTime: { month: string; count: number }[];
  };
  hearingStats: {
    total: number;
    completed: number;
    adjourned: number;
    cancelled: number;
    completionRate: number;
    adjournmentRate: number;
    cancellationRate: number;
    reliabilityTrend: { month: string; completed: number; adjourned: number }[];
  };
  ratingStats: {
    average: number | null;
    total: number;
    distribution: { rating: number; count: number }[];
  };
}

/**
 * Compute objective performance metrics for a lawyer based on court data.
 */
export async function getLawyerPerformance(lawyerUserId: string): Promise<LawyerPerformanceMetrics> {
  // Get all cases where this user is listed as counsel (COUNSEL_PLAINTIFF or COUNSEL_DEFENDANT)
  const partyRecords = await prisma.party.findMany({
    where: {
      userId: lawyerUserId,
      role: { in: ["COUNSEL_PLAINTIFF", "COUNSEL_DEFENDANT"] },
    },
    include: {
      case: {
        include: {
          hearings: {
            where: {
              status: { in: ["COMPLETED", "ADJOURNED", "CANCELLED"] },
            },
            select: {
              status: true,
              scheduledAt: true,
            },
          },
        },
      },
    },
  });

  const cases = partyRecords.map((p) => p.case);

  // ── Case Stats ────────────────────────────────────────────────────────
  const total = cases.length;
  const active = cases.filter((c) => c.status === "ACTIVE").length;
  const closed = cases.filter((c) => c.status === "CLOSED" || c.status === "ARCHIVED").length;

  // Average duration of closed cases
  const closedCases = cases.filter((c) => c.status === "CLOSED" && c.closedAt);
  const totalDurationDays = closedCases.reduce((sum, c) => {
    if (c.closedAt) {
      const diffMs = c.closedAt.getTime() - c.filedAt.getTime();
      return sum + diffMs / (1000 * 60 * 60 * 24);
    }
    return sum;
  }, 0);
  const averageDurationDays = closedCases.length > 0 ? Math.round(totalDurationDays / closedCases.length) : null;

  // Cases by type
  const typeMap = new Map<string, number>();
  for (const c of cases) {
    typeMap.set(c.type, (typeMap.get(c.type) || 0) + 1);
  }
  const byType = Array.from(typeMap.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  // Cases over time (monthly)
  const monthMap = new Map<string, number>();
  for (const c of cases) {
    const monthKey = `${c.filedAt.getFullYear()}-${String(c.filedAt.getMonth() + 1).padStart(2, "0")}`;
    monthMap.set(monthKey, (monthMap.get(monthKey) || 0) + 1);
  }
  const overTime = Array.from(monthMap.entries())
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month));

  // ── Hearing Stats ─────────────────────────────────────────────────────
  const allHearings = cases.flatMap((c) => c.hearings);
  const hearingTotal = allHearings.length;
  const hearingCompleted = allHearings.filter((h) => h.status === "COMPLETED").length;
  const hearingAdjourned = allHearings.filter((h) => h.status === "ADJOURNED").length;
  const hearingCancelled = allHearings.filter((h) => h.status === "CANCELLED").length;

  const completionRate = hearingTotal > 0 ? Math.round((hearingCompleted / hearingTotal) * 100) : 0;
  const adjournmentRate = hearingTotal > 0 ? Math.round((hearingAdjourned / hearingTotal) * 100) : 0;
  const cancellationRate = hearingTotal > 0 ? Math.round((hearingCancelled / hearingTotal) * 100) : 0;

  // Hearing reliability trend (monthly)
  const reliabilityMonthMap = new Map<string, { completed: number; adjourned: number }>();
  for (const h of allHearings) {
    const monthKey = `${h.scheduledAt.getFullYear()}-${String(h.scheduledAt.getMonth() + 1).padStart(2, "0")}`;
    const entry = reliabilityMonthMap.get(monthKey) || { completed: 0, adjourned: 0 };
    if (h.status === "COMPLETED") entry.completed++;
    if (h.status === "ADJOURNED") entry.adjourned++;
    reliabilityMonthMap.set(monthKey, entry);
  }
  const reliabilityTrend = Array.from(reliabilityMonthMap.entries())
    .map(([month, data]) => ({ month, ...data }))
    .sort((a, b) => a.month.localeCompare(b.month));

  // ── Rating Stats ──────────────────────────────────────────────────────
  const lawyerProfile = await prisma.lawyerProfile.findUnique({
    where: { userId: lawyerUserId },
    include: {
      ratings: {
        select: { rating: true },
      },
    },
  });

  let avgRating: number | null = null;
  let ratingDistribution: { rating: number; count: number }[] = [];
  const ratingTotal = lawyerProfile?.ratings.length ?? 0;

  if (lawyerProfile && ratingTotal > 0) {
    const sum = lawyerProfile.ratings.reduce((s: number, r: { rating: number }) => s + r.rating, 0);
    avgRating = parseFloat((sum / ratingTotal).toFixed(1));

    const distMap = new Map<number, number>();
    for (let i = 1; i <= 5; i++) distMap.set(i, 0);
    for (const r of lawyerProfile.ratings) {
      distMap.set(r.rating, (distMap.get(r.rating) || 0) + 1);
    }
    ratingDistribution = Array.from(distMap.entries())
      .map(([rating, count]) => ({ rating, count }))
      .sort((a, b) => a.rating - b.rating);
  }

  return {
    caseStats: {
      total,
      active,
      closed,
      averageDurationDays,
      byType,
      overTime,
    },
    hearingStats: {
      total: hearingTotal,
      completed: hearingCompleted,
      adjourned: hearingAdjourned,
      cancelled: hearingCancelled,
      completionRate,
      adjournmentRate,
      cancellationRate,
      reliabilityTrend,
    },
    ratingStats: {
      average: avgRating,
      total: ratingTotal,
      distribution: ratingDistribution,
    },
  };
}