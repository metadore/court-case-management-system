import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@tpt-court/database";
import QRCode from "qrcode";
import { getLawyerPerformance } from "../lib/lawyerPerformance.js";

const searchSchema = z.object({
  q: z.string().optional().default(""),
  type: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(50).optional().default(20),
});

const lawyerSearchSchema = z.object({
  q: z.string().optional().default(""),
  practiceArea: z.string().optional(),
  availability: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(50).optional().default(20),
});

const publicRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /api/public/cases — public case search
  app.get("/cases", async (request, reply) => {
    const parsed = searchSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "VALIDATION_ERROR",
        message: parsed.error.errors.map((e) => e.message).join(", "),
        statusCode: 400,
      });
    }

    const { q, type, page, pageSize } = parsed.data;

    const where: Record<string, unknown> = { isPublic: true };
    if (type) {
      where["type"] = type;
    }
    if (q && q.length >= 2) {
      where["OR"] = [
        { caseNumber: { contains: q, mode: "insensitive" } },
        { title: { contains: q, mode: "insensitive" } },
      ];
    }

    const [total, cases] = await Promise.all([
      prisma.case.count({ where: where as any }),
      prisma.case.findMany({
        where: where as any,
        select: {
          id: true,
          caseNumber: true,
          title: true,
          type: true,
          status: true,
          filedAt: true,
          assignedJudge: { select: { firstName: true, lastName: true } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { filedAt: "desc" },
      }),
    ]);

    return reply.send({
      data: cases,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  });

  // GET /api/public/cases/:caseNumber — public case detail
  app.get<{ Params: { caseNumber: string } }>("/cases/:caseNumber", async (request, reply) => {
    const { caseNumber } = request.params;

    const caseDetail = await prisma.case.findUnique({
      where: { caseNumber, isPublic: true },
      select: {
        id: true,
        caseNumber: true,
        title: true,
        type: true,
        status: true,
        description: true,
        filedAt: true,
        isPublic: true,
        tags: true,
        createdAt: true,
        updatedAt: true,
        assignedJudge: { select: { firstName: true, lastName: true } },
        parties: {
          select: {
            id: true,
            name: true,
            role: true,
            // email and phone intentionally excluded to protect PII on public endpoints
          },
          orderBy: { createdAt: "asc" },
        },
        hearings: {
          select: {
            id: true,
            scheduledAt: true,
            durationMins: true,
            type: true,
            status: true,
            notes: true,
            judge: { select: { firstName: true, lastName: true } },
            courtroom: { select: { name: true } },
          },
          orderBy: { scheduledAt: "desc" },
          take: 20,
        },
        documents: {
          where: { confidentiality: "PUBLIC" },
          select: {
            id: true,
            title: true,
            type: true,
            fileSize: true,
            mimeType: true,
            confidentiality: true,
            version: true,
            createdAt: true,
            uploadedBy: { select: { firstName: true, lastName: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });

    if (!caseDetail) {
      return reply.status(404).send({ error: "NOT_FOUND", message: "Case not found", statusCode: 404 });
    }

    return reply.send({ data: caseDetail });
  });

  // GET /api/public/cases/:caseNumber/qr — QR code SVG for the public case URL
  app.get<{ Params: { caseNumber: string } }>("/cases/:caseNumber/qr", async (request, reply) => {
    const { caseNumber } = request.params;
    const webOrigin = process.env["WEB_ORIGIN"] ?? "http://localhost:3000";
    const url = `${webOrigin}/public/cases/${encodeURIComponent(caseNumber)}`;
    const svg = await QRCode.toString(url, { type: "svg", margin: 1 });
    return reply
      .header("Content-Type", "image/svg+xml")
      .header("Cache-Control", "public, max-age=3600")
      .send(svg);
  });

  // ── Public Lawyer Endpoints ───────────────────────────────────────────────

  // GET /api/public/lawyers — list lawyers with search & filters
  app.get("/lawyers", async (request, reply) => {
    const parsed = lawyerSearchSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "VALIDATION_ERROR",
        message: parsed.error.errors.map((e) => e.message).join(", "),
        statusCode: 400,
      });
    }

    const { q, practiceArea, availability, page, pageSize } = parsed.data;

    // Build where clause for users with role LAWYER who are active
    const userWhere: Record<string, unknown> = {
      role: "LAWYER",
      isActive: true,
    };

    if (q && q.length >= 2) {
      userWhere["OR"] = [
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { barNumber: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ];
    }

    // For profile-level filters, use has: relation to LawyerProfile
    const profileWhere: Record<string, unknown> = {};
    if (practiceArea) {
      profileWhere["practiceAreas"] = { has: practiceArea };
    }
    if (availability) {
      profileWhere["availabilityStatus"] = availability;
    }

    // Count query
    const total = await prisma.user.count({
      where: {
        ...userWhere as any,
        ...(Object.keys(profileWhere).length > 0
          ? { lawyerProfile: { isNot: null, ...profileWhere as any } }
          : {}),
      },
    } as any);

    // Fetch users with lawyer profiles
    const users = await prisma.user.findMany({
      where: {
        ...userWhere as any,
        ...(Object.keys(profileWhere).length > 0
          ? { lawyerProfile: { isNot: null, ...profileWhere as any } }
          : {}),
      } as any,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        barNumber: true,
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
            ratings: {
              select: { rating: true },
            },
          },
        },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { lastName: "asc" },
    });

    // Compute total cases for each lawyer and build summaries
    const summaries = await Promise.all(
      users.map(async (u: any) => {
        const partyCount = await prisma.party.count({
          where: {
            userId: u.id,
            role: { in: ["COUNSEL_PLAINTIFF", "COUNSEL_DEFENDANT"] },
          },
        });

        const profile = u.lawyerProfile as any;
        const ratings: { rating: number }[] = profile?.ratings ?? [];
        const avgRating =
          ratings.length > 0
            ? parseFloat((ratings.reduce((s: number, r: { rating: number }) => s + r.rating, 0) / ratings.length).toFixed(1))
            : null;

        return {
          id: profile?.id ?? u.id,
          userId: u.id,
          firstName: u.firstName,
          lastName: u.lastName,
          barNumber: u.barNumber,
          bio: profile?.bio ?? null,
          photoUrl: profile?.photoUrl ?? null,
          practiceAreas: profile?.practiceAreas ?? [],
          yearsOfExperience: profile?.yearsOfExperience ?? null,
          officeAddress: profile?.officeAddress ?? null,
          website: profile?.website ?? null,
          availabilityStatus: profile?.availabilityStatus ?? "AVAILABLE",
          averageRating: avgRating,
          ratingCount: ratings.length,
          totalCases: partyCount,
        };
      }),
    );

    return reply.send({
      data: summaries,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  });

  // GET /api/public/lawyers/:userId — public lawyer profile detail + performance
  app.get<{ Params: { userId: string } }>("/lawyers/:userId", async (request, reply) => {
    const { userId } = request.params;

    const user = await prisma.user.findFirst({
      where: { id: userId, role: "LAWYER", isActive: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        barNumber: true,
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
              select: { rating: true },
            },
          },
        },
      },
    });

    if (!user || !user.lawyerProfile) {
      return reply.status(404).send({ error: "NOT_FOUND", message: "Lawyer not found", statusCode: 404 });
    }

    // Compute total cases count
    const partyCount = await prisma.party.count({
      where: {
        userId: user.id,
        role: { in: ["COUNSEL_PLAINTIFF", "COUNSEL_DEFENDANT"] },
      },
    });

    // Get performance metrics
    const performance = await getLawyerPerformance(user.id);

    const profile = user.lawyerProfile as any;
    const ratings: { rating: number }[] = profile?.ratings ?? [];
    const avgRating =
      ratings.length > 0
        ? parseFloat((ratings.reduce((s: number, r: { rating: number }) => s + r.rating, 0) / ratings.length).toFixed(1))
        : null;

    const summary = {
      id: profile.id,
      userId: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      barNumber: user.barNumber,
      bio: profile.bio ?? null,
      photoUrl: profile.photoUrl ?? null,
      practiceAreas: profile.practiceAreas ?? [],
      yearsOfExperience: profile.yearsOfExperience ?? null,
      officeAddress: profile.officeAddress ?? null,
      website: profile.website ?? null,
      availabilityStatus: profile.availabilityStatus ?? "AVAILABLE",
      averageRating: avgRating,
      ratingCount: ratings.length,
      totalCases: partyCount,
      customHours: profile.customHours,
      performance,
    };

    return reply.send({ data: summary });
  });

  // GET /api/public/lawyers/:userId/performance — raw performance data (for chart rendering)
  app.get<{ Params: { userId: string } }>("/lawyers/:userId/performance", async (request, reply) => {
    const { userId } = request.params;

    const user = await prisma.user.findFirst({
      where: { id: userId, role: "LAWYER", isActive: true },
      select: { id: true },
    });

    if (!user) {
      return reply.status(404).send({ error: "NOT_FOUND", message: "Lawyer not found", statusCode: 404 });
    }

    const performance = await getLawyerPerformance(user.id);
    return reply.send({ data: performance });
  });
};

export default publicRoutes;