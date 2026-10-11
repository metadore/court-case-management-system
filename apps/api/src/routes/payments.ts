import type { FastifyInstance } from "fastify";
import { prisma } from "@tpt-court/database";
import { stripe } from "../lib/stripe.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { requireTenantScope, scopeWhere } from "../middleware/tenantScope.js";
import { z } from "zod";
import { recordAuditLog } from "../lib/audit.js";
import { dispatchCaseEvent } from "../notifications/dispatch.js";


export default async function paymentRoutes(app: FastifyInstance) {
  // ── CSV export (admin/clerk only) ──────────────────────────────────────
  app.get("/payments/export", { preHandler: [requireAuth, requireTenantScope, requireRole("ADMIN", "CLERK")] }, async (request, reply) => {
    const { status } = request.query as Record<string, string | undefined>;
    const where: Record<string, unknown> = {};
    const tenantFilter = scopeWhere(request);

    // Scope by court via case relation
    if (tenantFilter.courtId) {
      where["case"] = { courtId: tenantFilter.courtId };
    }
    if (status) where["status"] = status;

    const payments = await prisma.payment.findMany({
      where,
      select: {
        id: true,
        type: true,
        amount: true,
        status: true,
        stripePaymentIntentId: true,
        createdAt: true,
        case: { select: { caseNumber: true, title: true } },
        payerUser: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10000,
    });

    const header = "id,type,amount,status,stripePaymentIntentId,caseNumber,caseTitle,payerName,payerEmail,createdAt";
    const rows = payments.map((p) => {
      const cols = [
        p.id,
        p.type,
        (p.amount / 100).toFixed(2),
        p.status,
        p.stripePaymentIntentId ?? "",
        p.case?.caseNumber ?? "",
        `"${(p.case?.title ?? "").replace(/"/g, '""')}"`,
        p.payerUser ? `${p.payerUser.firstName} ${p.payerUser.lastName}` : "",
        p.payerUser?.email ?? "",
        new Date(p.createdAt).toISOString(),
      ];
      return cols.join(",");
    });

    const csv = [header, ...rows].join("\n");
    return reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="payments-export-${Date.now()}.csv"`)
      .send(csv);
  });

  // ── List payments (admin sees all; users see own) ──────────────────────
  app.get("/payments", { preHandler: [requireAuth, requireTenantScope] }, async (request, reply) => {
    const page = Math.max(1, Number((request.query as Record<string, string>).page ?? 1));
    const pageSize = Math.min(50, Math.max(1, Number((request.query as Record<string, string>).pageSize ?? 20)));

    const where: Record<string, unknown> = {};

    if (request.user.role !== "ADMIN" && request.user.role !== "CLERK") {
      where["payerUserId"] = request.user.id;
    }

    const [data, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.payment.count({ where }),
    ]);

    return reply.send({ data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  });

  // ── Create payment intent (Stripe) ─────────────────────────────────────
  app.post("/payments/create-intent", { preHandler: [requireAuth] }, async (request, reply) => {
    const schema = z.object({
      amount: z.number().positive(),
      currency: z.string().default("usd"),
      type: z.enum(["FILING_FEE", "FINE", "SERVICE_FEE", "BAIL_BOND", "OTHER"]).default("OTHER"),
      description: z.string().optional(),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: parsed.error.message, statusCode: 400 });
    }

    const intent = await stripe.paymentIntents.create({
      amount: parsed.data.amount,
      currency: parsed.data.currency,
      metadata: {
        userId: request.user.id,
        type: parsed.data.type,
      },
    });

    const payment = await prisma.payment.create({
      data: {
        caseId: null, // linked separately once a case is created
        amount: parsed.data.amount,
        currency: parsed.data.currency,
        type: parsed.data.type,
        description: parsed.data.description ?? null,
        stripePaymentIntentId: intent.id,
        status: "PENDING",
        payerUserId: request.user.id,
      },
    });

    await recordAuditLog({
      prisma,
      actor: { id: request.user.id, role: request.user.role },
      courtId: null,
      entityType: "PAYMENT",
      entityId: payment.id,
      action: "PAYMENT_INTENT_CREATED",
      fromState: null,
      toState: payment.status,
      changes: { amount: payment.amount, currency: payment.currency, type: payment.type },
    });

    return reply.send({ data: { clientSecret: intent.client_secret, payment } });
  });

  // ── Confirm payment (for non-Stripe / manual flows) ────────────────────
  app.post<{ Params: { id: string } }>("/payments/:id/confirm", { preHandler: [requireAuth, requireTenantScope] }, async (request, reply) => {
    const payment = await prisma.payment.findUnique({ where: { id: request.params.id } });

    if (!payment) {
      return reply.status(404).send({ error: "NOT_FOUND", message: "Payment not found", statusCode: 404 });
    }

    // Verify ownership: only the payer or an admin can confirm a payment
    if (request.user.role !== "ADMIN" && payment.payerUserId !== request.user.id) {
      return reply.status(403).send({ error: "FORBIDDEN", message: "Not authorized to confirm this payment", statusCode: 403 });
    }

    const existing = await prisma.payment.findUnique({ where: { id: request.params.id }, select: { id: true, caseId: true, status: true, stripePaymentIntentId: true } });
    if (!existing) {
      return reply.status(404).send({ error: "NOT_FOUND", message: "Payment not found", statusCode: 404 });
    }

    // For Stripe payments, verify funds were actually collected before marking COMPLETED.
    // Manual cash/check payments have no stripePaymentIntentId.
    if (existing.stripePaymentIntentId) {
      const intent = await stripe.paymentIntents.retrieve(existing.stripePaymentIntentId);
      if (intent.status !== "succeeded") {
        return reply.status(402).send({
          error: "PAYMENT_NOT_SUCCEEDED",
          message: "Stripe payment has not been completed. Please finish checkout first.",
          statusCode: 402,
        });
      }
    }

    const updated = await prisma.payment.update({
      where: { id: request.params.id },
      data: { status: "COMPLETED" },
    });

    const caseRecord = existing.caseId
      ? await prisma.case.findUnique({ where: { id: existing.caseId }, select: { courtId: true } })
      : null;

    await recordAuditLog({
      prisma,
      actor: { id: request.user.id, role: request.user.role },
      courtId: caseRecord?.courtId ?? null,
      entityType: "PAYMENT",
      entityId: existing.id,
      action: "PAYMENT_STATUS_CHANGED",
      fromState: existing.status,
      toState: updated.status,
      changes: { status: { from: existing.status, to: updated.status } },
    });

    if (existing.caseId) {
      const amountFormatted = `${updated.currency.toUpperCase()} ${(updated.amount / 100).toFixed(2)}`;
      dispatchCaseEvent(existing.caseId, "PAYMENT_RECEIVED", { amountFormatted }).catch(() => {/* non-blocking */});
    }

    return reply.send({ data: updated });
  });

  // ── Record manual payment (admin/clerk only) ───────────────────────────
  app.post("/payments/record", { preHandler: [requireAuth, requireTenantScope, requireRole("ADMIN", "CLERK")] }, async (request, reply) => {
    const schema = z.object({
      caseId:      z.string().optional(),
      payerUserId: z.string().optional(),
      amount:      z.number().positive(), // cents
      currency:    z.string().default("USD"),
      type:        z.enum(["FILING_FEE", "FINE", "SERVICE_FEE", "BAIL_BOND", "OTHER"]).default("OTHER"),
      status:      z.enum(["PENDING", "COMPLETED"]).default("COMPLETED"),
      description: z.string().optional(),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: parsed.error.message, statusCode: 400 });
    }
    const d = parsed.data;
    const payment = await prisma.payment.create({
      data: {
        caseId:      d.caseId      ?? null,
        payerUserId: d.payerUserId ?? null,
        amount:      d.amount,
        currency:    d.currency,
        type:        d.type,
        status:      d.status,
        description: d.description ?? null,
      },
    });
    const caseRecord = d.caseId
      ? await prisma.case.findUnique({ where: { id: d.caseId }, select: { courtId: true } })
      : null;
    await recordAuditLog({
      prisma,
      actor: { id: request.user.id, role: request.user.role },
      courtId: caseRecord?.courtId ?? null,
      entityType: "PAYMENT",
      entityId: payment.id,
      action: "PAYMENT_RECORDED_MANUALLY",
      fromState: null,
      toState: payment.status,
      changes: { amount: payment.amount, type: payment.type },
    });
    if (d.caseId && d.status === "COMPLETED") {
      const amountFormatted = `${d.currency.toUpperCase()} ${(d.amount / 100).toFixed(2)}`;
      dispatchCaseEvent(d.caseId, "PAYMENT_RECEIVED", { amountFormatted }).catch(() => {});
    }
    return reply.status(201).send({ data: payment });
  });

  // ── Update payment status (admin/clerk only) ───────────────────────────
  app.patch<{ Params: { id: string } }>("/payments/:id/status", { preHandler: [requireAuth, requireTenantScope, requireRole("ADMIN", "CLERK")] }, async (request, reply) => {
    const schema = z.object({ status: z.enum(["PENDING", "COMPLETED", "FAILED", "REFUNDED"]) });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: parsed.error.message, statusCode: 400 });
    }
    const existing = await prisma.payment.findUnique({ where: { id: request.params.id }, select: { id: true, caseId: true, status: true } });
    if (!existing) {
      return reply.status(404).send({ error: "NOT_FOUND", message: "Payment not found", statusCode: 404 });
    }
    const updated = await prisma.payment.update({
      where: { id: request.params.id },
      data: { status: parsed.data.status },
    });
    const caseRecord = existing.caseId
      ? await prisma.case.findUnique({ where: { id: existing.caseId }, select: { courtId: true } })
      : null;
    await recordAuditLog({
      prisma,
      actor: { id: request.user.id, role: request.user.role },
      courtId: caseRecord?.courtId ?? null,
      entityType: "PAYMENT",
      entityId: existing.id,
      action: "PAYMENT_STATUS_CHANGED",
      fromState: existing.status,
      toState: updated.status,
      changes: { status: { from: existing.status, to: updated.status } },
    });
    return reply.send({ data: updated });
  });
}