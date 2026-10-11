import type { NotificationEventType, DeliveryChannel } from "@tpt-court/types";

export interface TemplateContext {
  caseNumber: string;
  caseTitle: string;
  scheduledAt?: string;
  hearingType?: string;
  documentTitle?: string;
  documentType?: string;
  fromStatus?: string;
  toStatus?: string;
  amountFormatted?: string;
  partyName?: string;
  partyRole?: string;
}

export interface RenderedTemplate {
  subject?: string;
  body: string;
}

type TemplateFn = (ctx: TemplateContext, channel: DeliveryChannel) => RenderedTemplate;

const TEMPLATES: Record<NotificationEventType, TemplateFn> = {
  HEARING_SCHEDULED: (ctx, ch) => ({
    subject: `Hearing Scheduled – ${ctx.caseNumber}`,
    body: ch === "SMS"
      ? `Court Notice: A ${ctx.hearingType} hearing for case ${ctx.caseNumber} (${ctx.caseTitle}) has been scheduled for ${ctx.scheduledAt}. Reply STOP to unsubscribe.`
      : `<p>A <strong>${ctx.hearingType}</strong> hearing for case <strong>${ctx.caseNumber}</strong> — ${ctx.caseTitle} — has been scheduled for <strong>${ctx.scheduledAt}</strong>.</p>`,
  }),

  HEARING_RESCHEDULED: (ctx, ch) => ({
    subject: `Hearing Rescheduled – ${ctx.caseNumber}`,
    body: ch === "SMS"
      ? `Court Notice: The ${ctx.hearingType} hearing for case ${ctx.caseNumber} has been rescheduled to ${ctx.scheduledAt}. Reply STOP to unsubscribe.`
      : `<p>The <strong>${ctx.hearingType}</strong> hearing for case <strong>${ctx.caseNumber}</strong> has been rescheduled to <strong>${ctx.scheduledAt}</strong>.</p>`,
  }),

  HEARING_CANCELLED: (ctx, ch) => ({
    subject: `Hearing Cancelled – ${ctx.caseNumber}`,
    body: ch === "SMS"
      ? `Court Notice: The ${ctx.hearingType} hearing for case ${ctx.caseNumber} has been cancelled. Reply STOP to unsubscribe.`
      : `<p>The <strong>${ctx.hearingType}</strong> hearing for case <strong>${ctx.caseNumber}</strong> has been cancelled.</p>`,
  }),

  HEARING_COMPLETED: (ctx, ch) => ({
    subject: `Hearing Completed – ${ctx.caseNumber}`,
    body: ch === "SMS"
      ? `Court Notice: The ${ctx.hearingType} hearing for case ${ctx.caseNumber} has been completed.`
      : `<p>The <strong>${ctx.hearingType}</strong> hearing for case <strong>${ctx.caseNumber}</strong> has been completed.</p>`,
  }),

  CASE_FILED: (ctx, ch) => ({
    subject: `New Case Filed – ${ctx.caseNumber}`,
    body: ch === "SMS"
      ? `Court Notice: Case ${ctx.caseNumber} (${ctx.caseTitle}) has been filed.`
      : `<p>Case <strong>${ctx.caseNumber}</strong> — ${ctx.caseTitle} — has been filed.</p>`,
  }),

  CASE_STATUS_CHANGED: (ctx, ch) => ({
    subject: `Case Status Updated – ${ctx.caseNumber}`,
    body: ch === "SMS"
      ? `Court Notice: Case ${ctx.caseNumber} status changed from ${ctx.fromStatus} to ${ctx.toStatus}. Reply STOP to unsubscribe.`
      : `<p>Case <strong>${ctx.caseNumber}</strong> status has changed from <strong>${ctx.fromStatus}</strong> to <strong>${ctx.toStatus}</strong>.</p>`,
  }),

  DOCUMENT_FILED: (ctx, ch) => ({
    subject: `Document Filed – ${ctx.caseNumber}`,
    body: ch === "SMS"
      ? `Court Notice: Document "${ctx.documentTitle}" (${ctx.documentType}) filed in case ${ctx.caseNumber}. Reply STOP to unsubscribe.`
      : `<p>A new document <strong>"${ctx.documentTitle}"</strong> (${ctx.documentType}) has been filed in case <strong>${ctx.caseNumber}</strong>.</p>`,
  }),

  PAYMENT_DUE: (ctx, ch) => ({
    subject: `Payment Due – ${ctx.caseNumber}`,
    body: ch === "SMS"
      ? `Court Notice: Payment of ${ctx.amountFormatted} is due for case ${ctx.caseNumber}. Reply STOP to unsubscribe.`
      : `<p>A payment of <strong>${ctx.amountFormatted}</strong> is due for case <strong>${ctx.caseNumber}</strong>.</p>`,
  }),

  PAYMENT_RECEIVED: (ctx, ch) => ({
    subject: `Payment Received – ${ctx.caseNumber}`,
    body: ch === "SMS"
      ? `Court Notice: Payment of ${ctx.amountFormatted} received for case ${ctx.caseNumber}.`
      : `<p>A payment of <strong>${ctx.amountFormatted}</strong> has been received for case <strong>${ctx.caseNumber}</strong>.</p>`,
  }),

  PARTY_ADDED: (ctx, ch) => ({
    subject: `Party Added – ${ctx.caseNumber}`,
    body: ch === "SMS"
      ? `Court Notice: ${ctx.partyName} (${ctx.partyRole}) added to case ${ctx.caseNumber}.`
      : `<p><strong>${ctx.partyName}</strong> (${ctx.partyRole}) has been added as a party to case <strong>${ctx.caseNumber}</strong>.</p>`,
  }),

  GENERAL_NOTICE: (ctx, ch) => ({
    subject: `Court Notice – ${ctx.caseNumber}`,
    body: ch === "SMS"
      ? `Court Notice for case ${ctx.caseNumber}: ${ctx.caseTitle}. Reply STOP to unsubscribe.`
      : `<p>General notice for case <strong>${ctx.caseNumber}</strong>: ${ctx.caseTitle}</p>`,
  }),

  HEARING_REMINDER: (ctx, ch) => ({
    subject: `Hearing Reminder – ${ctx.caseNumber}`,
    body: ch === "SMS"
      ? `Reminder: Your ${ctx.hearingType} hearing for case ${ctx.caseNumber} is scheduled for ${ctx.scheduledAt}. Reply STOP to unsubscribe.`
      : `<p><strong>Reminder:</strong> Your <strong>${ctx.hearingType}</strong> hearing for case <strong>${ctx.caseNumber}</strong> — ${ctx.caseTitle} — is scheduled for <strong>${ctx.scheduledAt}</strong>.</p>`,
  }),
};

export function renderTemplate(
  eventType: NotificationEventType,
  channel: DeliveryChannel,
  ctx: TemplateContext
): RenderedTemplate {
  const fn = TEMPLATES[eventType as keyof typeof TEMPLATES];
  if (!fn) return { subject: `Court Notice – ${ctx.caseNumber}`, body: `Update for case ${ctx.caseNumber}.` };
  return fn(ctx, channel);
}
