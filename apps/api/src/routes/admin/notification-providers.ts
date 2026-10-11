import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@tpt-court/database";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import { buildProvider, PROVIDER_TYPES } from "../../notifications/providers/registry.js";
import type { DeliveryChannel } from "@tpt-court/types";

const VALID_SMS_TYPES   = PROVIDER_TYPES.SMS as unknown as [string, ...string[]];
const VALID_EMAIL_TYPES = PROVIDER_TYPES.EMAIL as unknown as [string, ...string[]];

const createSchema = z.object({
  name:      z.string().min(1).max(100),
  type:      z.string(),
  channel:   z.enum(["SMS", "EMAIL"]),
  isDefault: z.boolean().default(false),
  config:    z.record(z.union([z.string(), z.number(), z.boolean()])),
});

const updateSchema = createSchema.partial().omit({ type: true, channel: true });

export default async function notificationProviderRoutes(app: FastifyInstance) {
  const guard = { preHandler: [requireAuth, requireRole("ADMIN")] };

  // ── List providers (config omitted for security) ────────────────────────
  app.get("/", guard, async (_request, reply) => {
    const providers = await prisma.notificationProvider.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, type: true, channel: true, isDefault: true, isActive: true, createdAt: true, updatedAt: true },
    });
    return reply.send({ data: providers });
  });

  // ── Create provider ─────────────────────────────────────────────────────
  app.post("/", guard, async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: parsed.error.message, statusCode: 400 });
    }

    const { name, type, channel, isDefault, config } = parsed.data;
    const validTypes = channel === "SMS" ? VALID_SMS_TYPES : VALID_EMAIL_TYPES;
    if (!validTypes.includes(type)) {
      return reply.status(400).send({ error: "INVALID_TYPE", message: `Type must be one of: ${validTypes.join(", ")}`, statusCode: 400 });
    }

    // Validate credentials by instantiating the provider
    try {
      buildProvider(type, config as Record<string, unknown>);
    } catch (err) {
      return reply.status(400).send({ error: "INVALID_CONFIG", message: err instanceof Error ? err.message : "Invalid config", statusCode: 400 });
    }

    // If this is the new default, demote all other defaults for this channel
    if (isDefault) {
      await prisma.notificationProvider.updateMany({
        where: { channel: channel as DeliveryChannel, isDefault: true },
        data: { isDefault: false },
      });
    }

    const provider = await prisma.notificationProvider.create({
      data: { name, type, channel: channel as DeliveryChannel, isDefault, config },
      select: { id: true, name: true, type: true, channel: true, isDefault: true, isActive: true, createdAt: true, updatedAt: true },
    });

    return reply.status(201).send({ data: provider });
  });

  // ── Update provider ─────────────────────────────────────────────────────
  app.patch<{ Params: { id: string } }>("/:id", guard, async (request, reply) => {
    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: parsed.error.message, statusCode: 400 });
    }

    const existing = await prisma.notificationProvider.findUnique({ where: { id: request.params.id } });
    if (!existing) return reply.status(404).send({ error: "NOT_FOUND", message: "Provider not found", statusCode: 404 });

    if (parsed.data.config) {
      try {
        buildProvider(existing.type, parsed.data.config as Record<string, unknown>);
      } catch (err) {
        return reply.status(400).send({ error: "INVALID_CONFIG", message: err instanceof Error ? err.message : "Invalid config", statusCode: 400 });
      }
    }

    if (parsed.data.isDefault) {
      await prisma.notificationProvider.updateMany({
        where: { channel: existing.channel, isDefault: true, id: { not: existing.id } },
        data: { isDefault: false },
      });
    }

    const updated = await prisma.notificationProvider.update({
      where: { id: request.params.id },
      data: parsed.data,
      select: { id: true, name: true, type: true, channel: true, isDefault: true, isActive: true, createdAt: true, updatedAt: true },
    });

    return reply.send({ data: updated });
  });

  // ── Delete provider ─────────────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>("/:id", guard, async (request, reply) => {
    const existing = await prisma.notificationProvider.findUnique({ where: { id: request.params.id } });
    if (!existing) return reply.status(404).send({ error: "NOT_FOUND", message: "Provider not found", statusCode: 404 });

    await prisma.notificationProvider.delete({ where: { id: request.params.id } });
    return reply.send({ data: { message: "Provider deleted" } });
  });

  // ── Test a provider by sending a test message ───────────────────────────
  app.post<{ Params: { id: string } }>("/:id/test", guard, async (request, reply) => {
    const schema = z.object({ recipient: z.string() });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: "recipient is required", statusCode: 400 });
    }

    const record = await prisma.notificationProvider.findUnique({ where: { id: request.params.id } });
    if (!record || !record.isActive) {
      return reply.status(404).send({ error: "NOT_FOUND", message: "Provider not found or inactive", statusCode: 404 });
    }

    const provider = buildProvider(record.type, record.config as Record<string, unknown>);
    const testBody = "TPT Court — this is a test notification. If you received this, your provider is configured correctly.";

    let messageId: string;
    if (record.channel === "SMS") {
      const sms = provider as import("../../notifications/providers/base.js").SmsProvider;
      messageId = (await sms.send(parsed.data.recipient, testBody)).messageId;
    } else {
      const email = provider as import("../../notifications/providers/base.js").EmailProvider;
      messageId = (await email.send({
        to: parsed.data.recipient,
        subject: "TPT Court — Provider Test",
        html: `<p>${testBody}</p>`,
        text: testBody,
      })).messageId;
    }

    return reply.send({ data: { messageId, message: "Test message sent successfully" } });
  });

  // ── List supported provider types ───────────────────────────────────────
  app.get("/types", guard, async (_request, reply) => {
    return reply.send({ data: PROVIDER_TYPES });
  });
}
