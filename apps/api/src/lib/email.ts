import nodemailer from "nodemailer";

// ── Configuration ──────────────────────────────────────────────────────────

const SMTP_HOST = process.env["SMTP_HOST"] ?? "";
const SMTP_PORT = parseInt(process.env["SMTP_PORT"] ?? "587", 10);
const SMTP_USER = process.env["SMTP_USER"] ?? "";
const SMTP_PASS = process.env["SMTP_PASS"] ?? "";
const SMTP_FROM = process.env["SMTP_FROM"] ?? "noreply@tpt-court.local";
const SMTP_FROM_NAME = process.env["SMTP_FROM_NAME"] ?? "TPT Court System";

const RESEND_API_KEY = process.env["RESEND_API_KEY"] ?? "";

/** Whether any email provider is configured */
export const EMAIL_ENABLED = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS) || Boolean(RESEND_API_KEY);

// ── Transport (lazy init) ─────────────────────────────────────────────────

let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!_transporter) {
    if (RESEND_API_KEY) {
      // Resend-compatible SMTP
      _transporter = nodemailer.createTransport({
        host: "smtp.resend.com",
        port: 465,
        secure: true,
        auth: {
          user: "resend",
          pass: RESEND_API_KEY,
        },
      });
    } else {
      _transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465,
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS,
        },
      });
    }
  }
  return _transporter;
}

// ── HTML Templates ────────────────────────────────────────────────────────

interface EmailTemplateParams {
  recipientName: string;
  caseNumber?: string;
  caseTitle?: string;
  actionBy?: string;
  link?: string;
  details?: string;
}

function wrapHtml(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5; }
    .container { max-width: 600px; margin: 0 auto; padding: 24px; }
    .card { background: #ffffff; border-radius: 8px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .header { border-bottom: 2px solid #1d4ed8; padding-bottom: 16px; margin-bottom: 24px; }
    .header h1 { font-size: 20px; color: #1e3a5f; margin: 0; }
    .footer { margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; }
    .btn { display: inline-block; padding: 10px 20px; background-color: #2563eb; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500; }
    .btn:hover { background-color: #1d4ed8; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <h1>TPT Court System</h1>
      </div>
      ${bodyHtml}
      <div class="footer">
        <p>This is an automated message from the TPT Court System. Please do not reply directly to this email.</p>
        <p>&copy; ${new Date().getFullYear()} TPT Court. All rights reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function templateCaseStatusChange(params: EmailTemplateParams): string {
  return wrapHtml(`
    <h2 style="font-size: 18px; color: #111827; margin-top: 0;">Case Status Updated</h2>
    <p style="color: #374151; line-height: 1.6;">Dear ${params.recipientName},</p>
    <p style="color: #374151; line-height: 1.6;">The status of case <strong>${params.caseNumber ?? "N/A"}</strong> has been updated.</p>
    ${params.details ? `<p style="color: #374151; line-height: 1.6;">${params.details}</p>` : ""}
    ${params.actionBy ? `<p style="color: #6b7280; font-size: 14px;">Action by: ${params.actionBy}</p>` : ""}
    ${params.link ? `<p style="margin-top: 20px;"><a href="${params.link}" class="btn">View Case</a></p>` : ""}
  `);
}

function templateNewDocument(params: EmailTemplateParams): string {
  return wrapHtml(`
    <h2 style="font-size: 18px; color: #111827; margin-top: 0;">New Document Filed</h2>
    <p style="color: #374151; line-height: 1.6;">Dear ${params.recipientName},</p>
    <p style="color: #374151; line-height: 1.6;">A new document has been filed in case <strong>${params.caseNumber ?? "N/A"}</strong>.</p>
    ${params.details ? `<p style="color: #374151; line-height: 1.6;">${params.details}</p>` : ""}
    ${params.link ? `<p style="margin-top: 20px;"><a href="${params.link}" class="btn">View Document</a></p>` : ""}
  `);
}

function templateHearingScheduled(params: EmailTemplateParams): string {
  return wrapHtml(`
    <h2 style="font-size: 18px; color: #111827; margin-top: 0;">Hearing Scheduled</h2>
    <p style="color: #374151; line-height: 1.6;">Dear ${params.recipientName},</p>
    <p style="color: #374151; line-height: 1.6;">A hearing has been scheduled for case <strong>${params.caseNumber ?? "N/A"}</strong>.</p>
    ${params.details ? `<p style="color: #374151; line-height: 1.6;">${params.details}</p>` : ""}
    ${params.link ? `<p style="margin-top: 20px;"><a href="${params.link}" class="btn">View Hearing</a></p>` : ""}
  `);
}

function templateDocumentSigned(params: EmailTemplateParams): string {
  return wrapHtml(`
    <h2 style="font-size: 18px; color: #111827; margin-top: 0;">Document Signed</h2>
    <p style="color: #374151; line-height: 1.6;">Dear ${params.recipientName},</p>
    <p style="color: #374151; line-height: 1.6;">A document has been electronically signed in case <strong>${params.caseNumber ?? "N/A"}</strong>.</p>
    ${params.details ? `<p style="color: #374151; line-height: 1.6;">${params.details}</p>` : ""}
    ${params.link ? `<p style="margin-top: 20px;"><a href="${params.link}" class="btn">View Document</a></p>` : ""}
  `);
}

function templatePaymentReceipt(params: EmailTemplateParams): string {
  return wrapHtml(`
    <h2 style="font-size: 18px; color: #111827; margin-top: 0;">Payment Receipt</h2>
    <p style="color: #374151; line-height: 1.6;">Dear ${params.recipientName},</p>
    <p style="color: #374151; line-height: 1.6;">A payment has been processed for case <strong>${params.caseNumber ?? "N/A"}</strong>.</p>
    ${params.details ? `<p style="color: #374151; line-height: 1.6;">${params.details}</p>` : ""}
    ${params.link ? `<p style="margin-top: 20px;"><a href="${params.link}" class="btn">View Payment</a></p>` : ""}
  `);
}

// ── Template registry ─────────────────────────────────────────────────────

type EmailTemplateType =
  | "case_status_changed"
  | "new_document"
  | "hearing_scheduled"
  | "document_signed"
  | "payment_receipt";

const templateMap: Record<EmailTemplateType, (params: EmailTemplateParams) => string> = {
  case_status_changed: templateCaseStatusChange,
  new_document: templateNewDocument,
  hearing_scheduled: templateHearingScheduled,
  document_signed: templateDocumentSigned,
  payment_receipt: templatePaymentReceipt,
};

const subjectMap: Record<EmailTemplateType, (params: EmailTemplateParams) => string> = {
  case_status_changed: (p) => `Case ${p.caseNumber ?? ""} Status Updated - TPT Court`,
  new_document: (p) => `New Document Filed - Case ${p.caseNumber ?? ""} - TPT Court`,
  hearing_scheduled: (p) => `Hearing Scheduled - Case ${p.caseNumber ?? ""} - TPT Court`,
  document_signed: (p) => `Document Signed - Case ${p.caseNumber ?? ""} - TPT Court`,
  payment_receipt: (p) => `Payment Receipt - Case ${p.caseNumber ?? ""} - TPT Court`,
};

// ── Public API ────────────────────────────────────────────────────────────

export interface SendEmailParams {
  to: string;
  template: EmailTemplateType;
  params: EmailTemplateParams;
  /** Override subject */
  subject?: string;
}

/**
 * Send an email using the configured provider.
 * Returns true if the email was sent successfully.
 */
export async function sendEmail(params: SendEmailParams): Promise<boolean> {
  if (!EMAIL_ENABLED) {
    console.warn("[email] Email not sent: no provider configured (set SMTP_* or RESEND_API_KEY)");
    return false;
  }

  try {
    const transporter = getTransporter();
    const htmlBuilder = templateMap[params.template];
    const subjectBuilder = subjectMap[params.template];

    if (!htmlBuilder) {
      console.error(`[email] Unknown email template: ${params.template}`);
      return false;
    }

    const html = htmlBuilder(params.params);
    const subject = params.subject ?? subjectBuilder(params.params);

    const info = await transporter.sendMail({
      from: `"${SMTP_FROM_NAME}" <${SMTP_FROM}>`,
      to: params.to,
      subject,
      html,
    });

    console.log(`[email] Sent ${params.template} to ${params.to} (messageId: ${info.messageId})`);
    return true;
  } catch (error) {
    console.error(`[email] Failed to send ${params.template} to ${params.to}:`, error);
    return false;
  }
}

/**
 * Send email to multiple recipients.
 */
export async function sendBulkEmails(
  recipients: Array<{ email: string }>,
  template: EmailTemplateType,
  params: EmailTemplateParams,
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  for (const recipient of recipients) {
    const ok = await sendEmail({
      to: recipient.email,
      template,
      params: { ...params, recipientName: recipient.email },
    });
    if (ok) sent++;
    else failed++;
  }

  return { sent, failed };
}

/**
 * Create an in-app notification and optionally send an email notification
 * to a user.
 */
export async function createNotificationWithEmail(
  prisma: {
    notification: {
      create: (args: {
        data: Record<string, unknown>;
      }) => Promise<{ id: string; userId: string; type: string; title: string; body: string }>;
    };
  },
  notification: {
    userId: string;
    caseId?: string | null;
    type: string;
    title: string;
    body: string;
    entityType?: string | null;
    entityId?: string | null;
  },
  emailConfig?: {
    template: EmailTemplateType;
    recipientEmail: string;
    recipientName: string;
    caseNumber?: string;
    caseTitle?: string;
    link?: string;
    details?: string;
  },
): Promise<{ notificationId: string }> {
  // Create the in-app notification
  const created = await prisma.notification.create({
    data: {
      userId: notification.userId,
      caseId: notification.caseId ?? null,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      isRead: false,
      entityType: notification.entityType ?? null,
      entityId: notification.entityId ?? null,
    },
  });

  // Optionally send an email
  if (emailConfig && EMAIL_ENABLED) {
    await sendEmail({
      to: emailConfig.recipientEmail,
      template: emailConfig.template,
      params: {
        recipientName: emailConfig.recipientName,
        caseNumber: emailConfig.caseNumber,
        caseTitle: emailConfig.caseTitle,
        link: emailConfig.link,
        details: emailConfig.details,
      },
    });
  }

  return { notificationId: created.id };
}