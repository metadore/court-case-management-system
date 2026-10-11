import { prisma } from "@tpt-court/database";
import type { DeliveryChannel } from "@tpt-court/types";
import type { SmsProvider, EmailProvider } from "./base.js";
import { TwilioSmsProvider } from "./sms/twilio.js";
import { VonageSmsProvider } from "./sms/vonage.js";
import { NodemailerEmailProvider } from "./email/nodemailer.js";
import { ResendEmailProvider } from "./email/resend.js";
import { SendGridEmailProvider } from "./email/sendgrid.js";

export type AnyProvider = SmsProvider | EmailProvider;

export function buildProvider(type: string, config: Record<string, unknown>): AnyProvider {
  const cfg = config as Record<string, string>;
  switch (type) {
    case "TWILIO":     return new TwilioSmsProvider(cfg);
    case "VONAGE":     return new VonageSmsProvider(cfg);
    case "NODEMAILER": return new NodemailerEmailProvider(config as Record<string, string | number | boolean>);
    case "RESEND":     return new ResendEmailProvider(cfg);
    case "SENDGRID":   return new SendGridEmailProvider(cfg);
    default:           throw new Error(`Unknown provider type: ${type}`);
  }
}

export async function getDefaultProvider(channel: DeliveryChannel): Promise<AnyProvider | null> {
  const record = await prisma.notificationProvider.findFirst({
    where: { channel, isDefault: true, isActive: true },
  });
  if (!record) return null;
  return buildProvider(record.type, record.config as Record<string, unknown>);
}

export async function getProviderById(id: string): Promise<AnyProvider | null> {
  const record = await prisma.notificationProvider.findUnique({ where: { id } });
  if (!record || !record.isActive) return null;
  return buildProvider(record.type, record.config as Record<string, unknown>);
}

export const PROVIDER_TYPES = {
  SMS: ["TWILIO", "VONAGE"] as const,
  EMAIL: ["NODEMAILER", "RESEND", "SENDGRID"] as const,
};

export type SmsProviderType = typeof PROVIDER_TYPES.SMS[number];
export type EmailProviderType = typeof PROVIDER_TYPES.EMAIL[number];
