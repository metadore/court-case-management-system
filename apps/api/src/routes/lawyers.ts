import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@tpt-court/database";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { getLawyerPerformance } from "../lib/lawyerPerformance.js";

const httpsUrlSchema = z.string().url().refine(
  (u) => u.startsWith("https://"),
  { message: "URL must use HTTPS" },
);

const profileUpdateSchema = z.object({
  bio: z.string().max(2000).optional(),
  photoUrl: httpsUrlSchema.optional(),
  practiceAreas: z.array(z.string()).optional(),
  yearsOfExperience: z.number().int().min(0).optional(),
  officeAddress: z.string().max(500).optional(),
  website: httpsUrlSchema.optional(),
  availabilityStatus: z.enum(["AVAILABLE", "BUSY", "NOT_ACCEPTING"]).optional(),
});

const ratingCreateSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

export default async function lawyerRoutes(app: FastifyInstance) {
  // ── Self-service: Get own profile ─────────────────────────────────────────
  app.get(
    "/lawyers/profile",
    { preHandler: [requireAuth, requireRole("LAWYER")] },
    async (request, reply) => {
      const profile = await prisma.lawyerProfile.findUnique({
        where: { userId: request.user.id },
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              barNumber: true,
              phone: true,
              email: true,
            },
          },
          ratings: { select: { rating: true } },
        },
      });

      if (!profile) {
        return reply.status(404).send({
          error: "NOT_FOUND",
          message: "Profile not found. Please contact an administrator.",
          statusCode: 404,
        });
      }

      const performance = await getLawyerPerformance(request.user.id);

      return reply.send({
        data: {
          ...profile,
          performance,
        },
      });
    },
  );

  // ── Self-service: Create or update own profile ──────────────────────────
  app.put(
    "/lawyers/profile",
    { preHandler: [requireAuth, requireRole("LAWYER")] },
    async (request, reply) => {
      const parsed = profileUpdateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "VALIDATION_ERROR",
          message: parsed.error.errors.map((e) => e.message).join(", "),
          statusCode: 400,
        });
      }

      const existing = await prisma.lawyerProfile.findUnique({
        where: { userId: request.user.id },
      });

      let profile;
      if (existing) {
        profile = await prisma.lawyerProfile.update({
          where: { userId: request.user.id },
          data: parsed.data,
        });
      } else {
        profile = await prisma.lawyerProfile.create({
          data: {
            userId: request.user.id,
            ...parsed.data,
          },
        });
      }

      return reply.send({ data: profile });
    },
  );

  // ── Self-service: Update availability status (quick toggle) ─────────────
  app.put(
    "/lawyers/availability",
    { preHandler: [requireAuth, requireRole("LAWYER")] },
    async (request, reply) => {
      const parsed = z
        .object({ availabilityStatus: z.enum(["AVAILABLE", "BUSY", "NOT_ACCEPTING"]) })
        .safeParse(request.body);

      if (!parsed.success) {
        return reply.status(400).send({
          error: "VALIDATION_ERROR",
          message: "Invalid availability status. Must be AVAILABLE, BUSY, or NOT_ACCEPTING.",
          statusCode: 400,
        });
      }

      const profile = await prisma.lawyerProfile.upsert({
        where: { userId: request.user.id },
        update: { availabilityStatus: parsed.data.availabilityStatus },
        create: {
          userId: request.user.id,
          availabilityStatus: parsed.data.availabilityStatus,
        },
      });

      return reply.send({ data: profile });
    },
  );

  // ── Submit a rating for a lawyer (authenticated users only) ─────────────
  app.post<{ Params: { id: string } }>(
    "/lawyers/:id/ratings",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params;

      // Verify the lawyer profile exists
      const profile = await prisma.lawyerProfile.findUnique({
        where: { id },
        select: { id: true },
      });

      if (!profile) {
        return reply.status(404).send({
          error: "NOT_FOUND",
          message: "Lawyer profile not found",
          statusCode: 404,
        });
      }

      const parsed = ratingCreateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "VALIDATION_ERROR",
          message: parsed.error.errors.map((e) => e.message).join(", "),
          statusCode: 400,
        });
      }

      // Upsert: one rating per user per lawyer
      const rating = await prisma.lawyerRating.upsert({
        where: {
          lawyerId_userId: {
            lawyerId: profile.id,
            userId: request.user.id,
          },
        },
        update: {
          rating: parsed.data.rating,
          comment: parsed.data.comment ?? null,
        },
        create: {
          lawyerId: profile.id,
          userId: request.user.id,
          rating: parsed.data.rating,
          comment: parsed.data.comment ?? null,
        },
      });

      return reply.send({ data: rating });
    },
  );

  // ── Admin: List all lawyers with performance summary ────────────────────
  app.get(
    "/admin/lawyers",
    { preHandler: [requireAuth, requireRole("ADMIN", "CLERK")] },
    async (request, reply) => {
      const users = await prisma.user.findMany({
        where: { role: "LAWYER" },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          barNumber: true,
          email: true,
          phone: true,
          isActive: true,
          lawyerProfile: {
            select: {
              id: true,
              practiceAreas: true,
              availabilityStatus: true,
              yearsOfExperience: true,
              ratings: { select: { rating: true } },
            },
          },
        },
        orderBy: { lastName: "asc" },
      });

      const userIds = users.map((u: any) => u.id as string);
      const partyCounts = await prisma.party.groupBy({
        by: ["userId"],
        where: { userId: { in: userIds }, role: { in: ["COUNSEL_PLAINTIFF", "COUNSEL_DEFENDANT"] } },
        _count: { _all: true },
      });
      const partyCountMap = new Map(partyCounts.map((p) => [p.userId, p._count._all]));

      const summaries = users.map((u: any) => {
        const profile = u.lawyerProfile as any;
        const ratings: { rating: number }[] = profile?.ratings ?? [];
        const avgRating =
          ratings.length > 0
            ? parseFloat((ratings.reduce((s: number, r: { rating: number }) => s + r.rating, 0) / ratings.length).toFixed(1))
            : null;
        return {
          userId: u.id,
          firstName: u.firstName,
          lastName: u.lastName,
          barNumber: u.barNumber,
          email: u.email,
          phone: u.phone,
          isActive: u.isActive,
          profileId: profile?.id ?? null,
          practiceAreas: profile?.practiceAreas ?? [],
          availabilityStatus: profile?.availabilityStatus ?? "NONE",
          yearsOfExperience: profile?.yearsOfExperience ?? null,
          averageRating: avgRating,
          ratingCount: ratings.length,
          totalCases: partyCountMap.get(u.id) ?? 0,
        };
      });

      return reply.send({ data: summaries });
    },
  );

  // ── Admin: Get full lawyer detail with performance ──────────────────────
  app.get<{ Params: { id: string } }>(
    "/admin/lawyers/:id",
    { preHandler: [requireAuth, requireRole("ADMIN", "CLERK")] },
    async (request, reply) => {
      const { id } = request.params;

      const user = await prisma.user.findFirst({
        where: { id, role: "LAWYER" },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          barNumber: true,
          email: true,
          phone: true,
          isActive: true,
          createdAt: true,
          courtId: true,
          lawyerProfile: {
            select: {
              id: true,
              bio: true,
              photoUrl: true,
              practiceAreas: true,
              yearsOfExperience: true,
              officeAddress: true,
              website: true,
              availabilityStatus: true,
              customHours: true,
              ratings: {
                select: { rating: true, comment: true, createdAt: true, userId: true },
                orderBy: { createdAt: "desc" },
                take: 50,
              },
            },
          },
        },
      });

      if (!user) {
        return reply.status(404).send({
          error: "NOT_FOUND",
          message: "Lawyer not found",
          statusCode: 404,
        });
      }

      const profile = user.lawyerProfile as any;
      const ratings: any[] = profile?.ratings ?? [];
      const avgRating =
        ratings.length > 0
          ? parseFloat((ratings.reduce((s: number, r: any) => s + r.rating, 0) / ratings.length).toFixed(1))
          : null;

      const partyCount = await prisma.party.count({
        where: {
          userId: user.id,
          role: { in: ["COUNSEL_PLAINTIFF", "COUNSEL_DEFENDANT"] },
        },
      });

      const performance = await getLawyerPerformance(user.id);

      return reply.send({
        data: {
          userId: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          barNumber: user.barNumber,
          email: user.email,
          phone: user.phone,
          isActive: user.isActive,
          createdAt: user.createdAt,
          courtId: user.courtId,
          profileId: profile?.id ?? null,
          bio: profile?.bio ?? null,
          photoUrl: profile?.photoUrl ?? null,
          practiceAreas: profile?.practiceAreas ?? [],
          yearsOfExperience: profile?.yearsOfExperience ?? null,
          officeAddress: profile?.officeAddress ?? null,
          website: profile?.website ?? null,
          availabilityStatus: profile?.availabilityStatus ?? "NONE",
          totalCases: partyCount,
          averageRating: avgRating,
          ratingCount: ratings.length,
          recentRatings: ratings.slice(0, 10),
          performance,
        },
      });
    },
  );

  // ── Admin: Update any lawyer's profile ──────────────────────────────────
  app.put<{ Params: { id: string } }>(
    "/admin/lawyers/:id",
    { preHandler: [requireAuth, requireRole("ADMIN")] },
    async (request, reply) => {
      const { id } = request.params;
      const parsed = profileUpdateSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.status(400).send({
          error: "VALIDATION_ERROR",
          message: parsed.error.errors.map((e) => e.message).join(", "),
          statusCode: 400,
        });
      }

      const profile = await prisma.lawyerProfile.upsert({
        where: { userId: id },
        update: parsed.data,
        create: {
          userId: id,
          ...parsed.data,
        },
      });

      return reply.send({ data: profile });
    },
  );
}