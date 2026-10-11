import { prisma } from "@tpt-court/database";
import type { NotificationEventType } from "@tpt-court/types";
import { renderTemplate } from "./templates.js";
import type { TemplateContext } from "./templates.js";

const DEFAULT_REMINDER_DAYS = Number(process.env["HEARING_REMINDER_DAYS"] ?? "2");

export async function dispatchCaseEvent(
  caseId: string,
  eventType: NotificationEventType,
  context: Omit<TemplateContext, "caseNumber" | "caseTitle">
): Promise<void> {
  const caseRecord = await prisma.case.findUnique({
    where: { id: caseId },
    select: { caseNumber: true, title: true },
  });
  if (!caseRecord) return;

  const ctx: TemplateContext = {
    ...context,
    caseNumber: caseRecord.caseNumber,
    caseTitle: caseRecord.title,
  };

  const now = new Date();

  const subscriptions = await prisma.notificationSubscription.findMany({
    where: {
      caseId,
      isActive: true,
      OR: [
        { subscribeAll: true },
        { eventTypes: { has: eventType } },
      ],
    },
  });

  const rows = subscriptions.flatMap((sub) => {
    // Paid tiers expire; STAFF and PARTY are always free
    const isPaid = sub.tier === "PUBLIC_BASIC" || sub.tier === "PUBLIC_PRO";
    if (isPaid && sub.activeUntil && sub.activeUntil < now) return [];

    return sub.channels.flatMap((channel) => {
      const recipient = channel === "SMS" ? sub.phone : sub.email;
      if (!recipient) return [];

      const { subject, body } = renderTemplate(eventType, channel, ctx);
      return [{
        subscriptionId: sub.id,
        caseId,
        channel,
        eventType,
        recipient,
        subject: subject ?? null,
        body,
      }];
    });
  });

  if (rows.length > 0) {
    await prisma.outboundNotification.createMany({ data: rows });
  }
}

/**
 * Pre-schedules reminder notifications for all case subscribers N days before a hearing.
 * Called at hearing-creation time so the worker delivers them at the right moment.
 */
export async function scheduleHearingReminder(
  caseId: string,
  hearingId: string,
  hearingType: string,
  scheduledAt: Date,
  reminderDays: number = DEFAULT_REMINDER_DAYS,
): Promise<void> {
  const reminderAt = new Date(scheduledAt.getTime() - reminderDays * 24 * 60 * 60 * 1000);

  // Only schedule if reminder time is in the future
  if (reminderAt <= new Date()) return;

  const caseRecord = await prisma.case.findUnique({
    where: { id: caseId },
    select: { caseNumber: true, title: true },
  });
  if (!caseRecord) return;

  const ctx: TemplateContext = {
    caseNumber: caseRecord.caseNumber,
    caseTitle: caseRecord.title,
    hearingType,
    scheduledAt: scheduledAt.toLocaleString(),
  };

  const subscriptions = await prisma.notificationSubscription.findMany({
    where: {
      caseId,
      isActive: true,
      OR: [
        { subscribeAll: true },
        { eventTypes: { has: "HEARING_REMINDER" } },
        { eventTypes: { has: "HEARING_SCHEDULED" } },
      ],
    },
  });

  const now = new Date();
  const rows = subscriptions.flatMap((sub) => {
    const isPaid = sub.tier === "PUBLIC_BASIC" || sub.tier === "PUBLIC_PRO";
    if (isPaid && sub.activeUntil && sub.activeUntil < now) return [];

    return sub.channels.flatMap((channel) => {
      const recipient = channel === "SMS" ? sub.phone : sub.email;
      if (!recipient) return [];
      const { subject, body } = renderTemplate("HEARING_REMINDER", channel, ctx);
      return [{
        subscriptionId: sub.id,
        caseId,
        channel,
        eventType: "HEARING_REMINDER" as const,
        recipient,
        subject: subject ?? null,
        body,
        scheduledAt: reminderAt,
      }];
    });
  });

  if (rows.length > 0) {
    await prisma.outboundNotification.createMany({ data: rows });
    console.info(`[reminders] Scheduled ${rows.length} reminder(s) for hearing ${hearingId} at ${reminderAt.toISOString()}`);
  }
}
