import type { FastifyInstance } from "fastify";
import { prisma } from "@tpt-court/database";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { requireTenantScope } from "../middleware/tenantScope.js";
import { z } from "zod";

type ChecklistStep = { step: string; description?: string };

const CHECKLIST_DEFAULTS: Record<string, ChecklistStep[]> = {
  CRIMINAL: [
    { step: "Arraignment", description: "Initial court appearance and plea entry" },
    { step: "Bail Hearing", description: "Determination of bail conditions" },
    { step: "Preliminary Hearing", description: "Review of evidence to determine if trial is warranted" },
    { step: "Pre-Trial Conference", description: "Conference to address pre-trial matters" },
    { step: "Trial", description: "Full evidentiary hearing before judge or jury" },
    { step: "Sentencing", description: "Imposition of sentence upon conviction" },
  ],
  CIVIL: [
    { step: "Complaint Filed", description: "Initial complaint submitted to court" },
    { step: "Summons Issued", description: "Summons issued and served on defendant" },
    { step: "Answer Filed", description: "Defendant's answer to the complaint" },
    { step: "Discovery", description: "Exchange of evidence between parties" },
    { step: "Pre-Trial Conference", description: "Conference to address pre-trial matters" },
    { step: "Trial", description: "Full evidentiary hearing" },
    { step: "Judgment", description: "Court issues final judgment" },
  ],
  FAMILY: [
    { step: "Petition Filed", description: "Initial family law petition submitted" },
    { step: "Temporary Orders", description: "Temporary orders for immediate relief" },
    { step: "Mediation", description: "Mediation session between parties" },
    { step: "Discovery", description: "Exchange of financial and other disclosures" },
    { step: "Trial", description: "Full evidentiary hearing" },
    { step: "Final Orders", description: "Court issues final orders" },
  ],
  APPELLATE: [
    { step: "Notice of Appeal Filed", description: "Notice of appeal submitted to court" },
    { step: "Record on Appeal", description: "Trial court record transmitted" },
    { step: "Opening Brief", description: "Appellant's opening brief filed" },
    { step: "Response Brief", description: "Appellee's response brief filed" },
    { step: "Oral Argument", description: "Oral arguments presented to appellate panel" },
    { step: "Decision", description: "Appellate court issues decision" },
  ],
};

const DEFAULT_STEPS: ChecklistStep[] = [
  { step: "Case Filed", description: "Case documents submitted to court" },
  { step: "Initial Hearing", description: "First court hearing scheduled" },
  { step: "Trial", description: "Full evidentiary hearing" },
  { step: "Disposition", description: "Case resolved" },
];

export default async function checklistRoutes(app: FastifyInstance) {
  // ── Get checklist items for a case ────────────────────────────────────
  app.get<{ Params: { caseId: string } }>(
    "/cases/:caseId/checklist",
    { preHandler: [requireAuth, requireTenantScope] },
    async (request, reply) => {
      const { caseId } = request.params;

      const caseRecord = await prisma.case.findUnique({
        where: { id: caseId },
        select: { id: true, courtId: true },
      });
      if (!caseRecord) {
        return reply.status(404).send({ error: "NOT_FOUND", message: "Case not found", statusCode: 404 });
      }
      const userCourtId = request.user.courtId;
      if (userCourtId && caseRecord.courtId !== userCourtId) {
        return reply.status(403).send({ error: "FORBIDDEN", message: "Access denied", statusCode: 403 });
      }

      const items = await (prisma as any).caseChecklistItem.findMany({
        where: { caseId },
        include: {
          completedBy: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { order: "asc" },
      });

      return reply.send({ data: items });
    },
  );

  // ── Initialize checklist from case type defaults ───────────────────────
  app.post<{ Params: { caseId: string } }>(
    "/cases/:caseId/checklist/initialize",
    { preHandler: [requireAuth, requireTenantScope, requireRole("ADMIN", "CLERK")] },
    async (request, reply) => {
      const { caseId } = request.params;

      const caseRecord = await prisma.case.findUnique({
        where: { id: caseId },
        select: { id: true, courtId: true, type: true },
      });
      if (!caseRecord) {
        return reply.status(404).send({ error: "NOT_FOUND", message: "Case not found", statusCode: 404 });
      }
      const userCourtId = request.user.courtId;
      if (userCourtId && caseRecord.courtId !== userCourtId) {
        return reply.status(403).send({ error: "FORBIDDEN", message: "Access denied", statusCode: 403 });
      }

      // Check if checklist already has items
      const existingCount = await (prisma as any).caseChecklistItem.count({ where: { caseId } });
      if (existingCount > 0) {
        return reply.status(409).send({
          error: "ALREADY_INITIALIZED",
          message: "Checklist has already been initialized for this case",
          statusCode: 409,
        });
      }

      const steps = CHECKLIST_DEFAULTS[caseRecord.type as string] ?? DEFAULT_STEPS;

      const data = steps.map((s, idx) => ({
        caseId,
        step: s.step,
        description: s.description ?? null,
        order: idx + 1,
        isCompleted: false,
      }));

      await (prisma as any).caseChecklistItem.createMany({ data });

      const items = await (prisma as any).caseChecklistItem.findMany({
        where: { caseId },
        include: {
          completedBy: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { order: "asc" },
      });

      return reply.status(201).send({ data: items });
    },
  );

  // ── Mark checklist item complete/incomplete ───────────────────────────
  app.patch<{ Params: { caseId: string; id: string } }>(
    "/cases/:caseId/checklist/:id",
    { preHandler: [requireAuth, requireTenantScope] },
    async (request, reply) => {
      const { caseId, id } = request.params;

      if (request.user.role === "PUBLIC") {
        return reply.status(403).send({ error: "FORBIDDEN", message: "Insufficient permissions", statusCode: 403 });
      }

      const schema = z.object({
        isCompleted: z.boolean(),
      });

      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "VALIDATION_ERROR", message: parsed.error.message, statusCode: 400 });
      }

      const existing = await (prisma as any).caseChecklistItem.findFirst({
        where: { id, caseId },
        include: { case: { select: { courtId: true } } },
      });
      if (!existing) {
        return reply.status(404).send({ error: "NOT_FOUND", message: "Checklist item not found", statusCode: 404 });
      }

      const userCourtId = request.user.courtId;
      if (userCourtId && existing.case.courtId !== userCourtId) {
        return reply.status(403).send({ error: "FORBIDDEN", message: "Access denied", statusCode: 403 });
      }

      const updated = await (prisma as any).caseChecklistItem.update({
        where: { id },
        data: {
          isCompleted: parsed.data.isCompleted,
          completedAt: parsed.data.isCompleted ? new Date() : null,
          completedById: parsed.data.isCompleted ? request.user.id : null,
        },
        include: {
          completedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      return reply.send({ data: updated });
    },
  );

  // ── Add custom checklist item ──────────────────────────────────────────
  app.post<{ Params: { caseId: string } }>(
    "/cases/:caseId/checklist",
    { preHandler: [requireAuth, requireTenantScope, requireRole("ADMIN", "CLERK", "JUDGE")] },
    async (request, reply) => {
      const { caseId } = request.params;

      const schema = z.object({
        step: z.string().min(1).max(255),
        description: z.string().max(1000).optional(),
        order: z.number().int().min(1).optional(),
      });

      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "VALIDATION_ERROR", message: parsed.error.message, statusCode: 400 });
      }

      const caseRecord = await prisma.case.findUnique({
        where: { id: caseId },
        select: { id: true, courtId: true },
      });
      if (!caseRecord) {
        return reply.status(404).send({ error: "NOT_FOUND", message: "Case not found", statusCode: 404 });
      }
      const userCourtId = request.user.courtId;
      if (userCourtId && caseRecord.courtId !== userCourtId) {
        return reply.status(403).send({ error: "FORBIDDEN", message: "Access denied", statusCode: 403 });
      }

      // Determine order: use provided or append at end
      let order = parsed.data.order;
      if (order === undefined) {
        const maxItem = await (prisma as any).caseChecklistItem.findFirst({
          where: { caseId },
          orderBy: { order: "desc" },
          select: { order: true },
        });
        order = (maxItem?.order ?? 0) + 1;
      }

      const item = await (prisma as any).caseChecklistItem.create({
        data: {
          caseId,
          step: parsed.data.step,
          description: parsed.data.description ?? null,
          order,
          isCompleted: false,
        },
        include: {
          completedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      return reply.status(201).send({ data: item });
    },
  );
}
