import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@tpt-court/database";
import { stripe } from "../lib/stripe.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import type { NotificationEventType, DeliveryChannel, SubscriptionTier } from "@tpt-court/types";

const EVENT_TYPES: NotificationEventType[] = [
  "HEARING_SCHEDULED", "HEARING_RESCHEDULED", "HEARING_CANCELLED", "HEARING_COMPLETED",
  "CASE_FILED", "CASE_STATUS_CHANGED", "DOCUMENT_FILED",
  "PAYMENT_DUE", "PAYMENT_RECEIVED", "PARTY_ADDED", "GENERAL_NOTICE",
];

const CHANNELS: DeliveryChannel[] = ["SMS", "EMAIL"];

function inferTier(role: string): SubscriptionTier {
  if (role === "ADMIN" || role === "JUDGE" || role === "CLERK") return "STAFF";
  if (role === "LAWYER") return "PARTY";
  return "PUBLIC_BASIC";
}

export default async function subscriptionRoutes(app: FastifyInstance) {
  // ── List available plans (public) ──────────────────────────────────────
  app.get("/plans", async (_request, reply) => {
    const plans = await prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { pricePerMonth: "asc" },
      select: {
        id: true, name: true, tier: true, stripePriceId: true,
        pricePerMonth: true, maxCases: true, channels: true, description: true,
      },
    });
    return reply.send({ data: plans });
  });

  // ── Create subscription ─────────────────────────────────────────────────
  app.post("/", { preHandler: [requireAuth] }, async (request, reply) => {
    const schema = z.object({
      caseId:       z.string(),
      channels:     z.array(z.enum(["SMS", "EMAIL"])).min(1),
      subscribeAll: z.boolean().default(false),
      eventTypes:   z.array(z.enum(["HEARING_SCHEDULED", "HEARING_RESCHEDULED", "HEARING_CANCELLED",
        "HEARING_COMPLETED", "CASE_FILED", "CASE_STATUS_CHANGED", "DOCUMENT_FILED",
        "PAYMENT_DUE", "PAYMENT_RECEIVED", "PARTY_ADDED", "GENERAL_NOTICE"])).default([]),
      phone:  z.string().optional(),
      email:  z.string().email().optional(),
      planId: z.string().optional(),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: parsed.error.message, statusCode: 400 });
    }

    const { caseId, channels, subscribeAll, eventTypes, planId } = parsed.data;
    const phone = parsed.data.phone ?? null;
    const email = parsed.data.email ?? request.user.email ?? null;

    if (!phone && channels.includes("SMS")) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: "phone is required for SMS notifications", statusCode: 400 });
    }

    const caseRecord = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true } });
    if (!caseRecord) {
      return reply.status(404).send({ error: "NOT_FOUND", message: "Case not found", statusCode: 404 });
    }

    const existing = await prisma.notificationSubscription.findUnique({
      where: { userId_caseId: { userId: request.user.id, caseId } },
    });
    if (existing) {
      return reply.status(409).send({ error: "CONFLICT", message: "Already subscribed to this case", statusCode: 409 });
    }

    const tier = inferTier(request.user.role);
    const isFreeTier = tier === "STAFF" || tier === "PARTY";

    const subscription = await prisma.notificationSubscription.create({
      data: {
        caseId,
        userId: request.user.id,
        email,
        phone,
        channels: channels as DeliveryChannel[],
        subscribeAll,
        eventTypes: subscribeAll ? EVENT_TYPES : (eventTypes as NotificationEventType[]),
        tier,
        isActive: isFreeTier,
      },
    });

    if (isFreeTier || !planId) {
      return reply.status(201).send({ data: { subscription } });
    }

    // Paid tier: create Stripe Checkout session
    const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId, isActive: true } });
    if (!plan) {
      return reply.status(400).send({ error: "INVALID_PLAN", message: "Plan not found or inactive", statusCode: 400 });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      customer_email: email ?? undefined,
      metadata: { subscriptionId: subscription.id },
      success_url: `${process.env["WEB_URL"] ?? "http://localhost:3000"}/subscriptions/${subscription.id}?checkout=success`,
      cancel_url:  `${process.env["WEB_URL"] ?? "http://localhost:3000"}/subscriptions/${subscription.id}?checkout=cancelled`,
    });

    return reply.status(201).send({ data: { subscription, checkoutUrl: session.url } });
  });

  // ── List my subscriptions ───────────────────────────────────────────────
  app.get("/", { preHandler: [requireAuth] }, async (request, reply) => {
    const subs = await prisma.notificationSubscription.findMany({
      where: { userId: request.user.id },
      include: { case: { select: { caseNumber: true, title: true } } },
      orderBy: { createdAt: "desc" },
    });
    return reply.send({ data: subs });
  });

  // ── Get one subscription ────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>("/:id", { preHandler: [requireAuth] }, async (request, reply) => {
    const sub = await prisma.notificationSubscription.findFirst({
      where: { id: request.params.id, userId: request.user.id },
      include: { case: { select: { caseNumber: true, title: true } } },
    });
    if (!sub) return reply.status(404).send({ error: "NOT_FOUND", message: "Subscription not found", statusCode: 404 });
    return reply.send({ data: sub });
  });

  // ── Update preferences ──────────────────────────────────────────────────
  app.patch<{ Params: { id: string } }>("/:id", { preHandler: [requireAuth] }, async (request, reply) => {
    const schema = z.object({
      channels:     z.array(z.enum(["SMS", "EMAIL"])).min(1).optional(),
      subscribeAll: z.boolean().optional(),
      eventTypes:   z.array(z.enum(["HEARING_SCHEDULED", "HEARING_RESCHEDULED", "HEARING_CANCELLED",
        "HEARING_COMPLETED", "CASE_FILED", "CASE_STATUS_CHANGED", "DOCUMENT_FILED",
        "PAYMENT_DUE", "PAYMENT_RECEIVED", "PARTY_ADDED", "GENERAL_NOTICE"])).optional(),
      phone: z.string().optional(),
      email: z.string().email().optional(),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: parsed.error.message, statusCode: 400 });
    }

    const sub = await prisma.notificationSubscription.findFirst({
      where: { id: request.params.id, userId: request.user.id },
    });
    if (!sub) return reply.status(404).send({ error: "NOT_FOUND", message: "Subscription not found", statusCode: 404 });

    const subscribeAll = parsed.data.subscribeAll ?? sub.subscribeAll;
    const updated = await prisma.notificationSubscription.update({
      where: { id: sub.id },
      data: {
        channels:     parsed.data.channels as DeliveryChannel[] | undefined,
        subscribeAll,
        eventTypes:   subscribeAll ? EVENT_TYPES : (parsed.data.eventTypes as NotificationEventType[] | undefined),
        phone:        parsed.data.phone,
        email:        parsed.data.email,
      },
    });
    return reply.send({ data: updated });
  });

  // ── Cancel subscription ─────────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>("/:id", { preHandler: [requireAuth] }, async (request, reply) => {
    const sub = await prisma.notificationSubscription.findFirst({
      where: { id: request.params.id, userId: request.user.id },
    });
    if (!sub) return reply.status(404).send({ error: "NOT_FOUND", message: "Subscription not found", statusCode: 404 });

    // Cancel Stripe subscription if one exists
    if (sub.stripeSubscriptionId) {
      await stripe.subscriptions.cancel(sub.stripeSubscriptionId).catch(() => {/* already cancelled */});
    }

    await prisma.notificationSubscription.update({
      where: { id: sub.id },
      data: { isActive: false },
    });
    return reply.send({ data: { message: "Subscription cancelled" } });
  });

  // ── Stripe webhook ──────────────────────────────────────────────────────
  app.post("/stripe-webhook", async (request, reply) => {
    const sig = request.headers["stripe-signature"] as string;
    const secret = process.env["STRIPE_WEBHOOK_SECRET"];
    if (!secret) {
      return reply.status(500).send({ error: "MISCONFIGURED", message: "Webhook secret not set", statusCode: 500 });
    }

    let event;
    try {
      const rawBody = (request as unknown as Record<string, unknown>)["rawBody"] as Buffer | undefined;
      if (!rawBody) {
        return reply.status(400).send({ error: "MISSING_RAW_BODY", message: "Raw body unavailable for signature verification", statusCode: 400 });
      }
      event = stripe.webhooks.constructEvent(rawBody, sig, secret);
    } catch {
      return reply.status(400).send({ error: "INVALID_SIGNATURE", message: "Webhook signature verification failed", statusCode: 400 });
    }

    const obj = event.data.object as unknown as Record<string, unknown>;

    if (event.type === "checkout.session.completed") {
      const subscriptionId = (obj["metadata"] as Record<string, string>)?.["subscriptionId"];
      const stripeSubId = obj["subscription"] as string | null;
      if (subscriptionId && stripeSubId) {
        const stripeSub = await stripe.subscriptions.retrieve(stripeSubId);
        const activeUntil = new Date((stripeSub.current_period_end as number) * 1000);
        await prisma.notificationSubscription.updateMany({
          where: { id: subscriptionId },
          data: { isActive: true, stripeSubscriptionId: stripeSubId, activeUntil },
        });
      }
    }

    if (event.type === "customer.subscription.updated") {
      const stripeSubId = obj["id"] as string;
      const activeUntil = new Date((obj["current_period_end"] as number) * 1000);
      const status = obj["status"] as string;
      await prisma.notificationSubscription.updateMany({
        where: { stripeSubscriptionId: stripeSubId },
        data: { activeUntil, isActive: status === "active" },
      });
    }

    if (event.type === "customer.subscription.deleted") {
      const stripeSubId = obj["id"] as string;
      await prisma.notificationSubscription.updateMany({
        where: { stripeSubscriptionId: stripeSubId },
        data: { isActive: false },
      });
    }

    return reply.send({ received: true });
  });

  // ── Admin: list all subscriptions for a case ────────────────────────────
  app.get<{ Params: { caseId: string } }>("/case/:caseId", { preHandler: [requireAuth, requireRole("ADMIN", "CLERK")] }, async (request, reply) => {
    const subs = await prisma.notificationSubscription.findMany({
      where: { caseId: request.params.caseId },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: "desc" },
    });
    return reply.send({ data: subs });
  });
}
