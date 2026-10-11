import twilio from "twilio";

// ── Configuration ──────────────────────────────────────────────────────────

const TWILIO_ACCOUNT_SID = process.env["TWILIO_ACCOUNT_SID"] ?? "";
const TWILIO_AUTH_TOKEN = process.env["TWILIO_AUTH_TOKEN"] ?? "";
const TWILIO_PHONE_NUMBER = process.env["TWILIO_PHONE_NUMBER"] ?? "";

/** Whether Twilio SMS is configured */
export const SMS_ENABLED = Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER);

// ── Client (lazy init) ────────────────────────────────────────────────────

let _twilioClient: twilio.Twilio | null = null;

function getClient(): twilio.Twilio {
  if (!_twilioClient) {
    _twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  }
  return _twilioClient;
}

// ── Public API ────────────────────────────────────────────────────────────

export type SmsTemplateType =
  | "case_status_changed"
  | "new_document"
  | "hearing_scheduled"
  | "document_signed"
  | "payment_receipt"
  | "general";

interface SmsMessageParams {
  recipientName?: string;
  caseNumber?: string;
  caseTitle?: string;
  details?: string;
  actionBy?: string;
}

function buildMessage(template: SmsTemplateType, params: SmsMessageParams): string {
  const caseRef = params.caseNumber ? ` in case ${params.caseNumber}` : "";
  const prefix = params.recipientName ? `Dear ${params.recipientName}, ` : "";

  switch (template) {
    case "case_status_changed":
      return `${prefix}Case status updated${caseRef}. ${params.details ?? ""}`;
    case "new_document":
      return `${prefix}A new document has been filed${caseRef}. ${params.details ?? ""}`;
    case "hearing_scheduled":
      return `${prefix}A hearing has been scheduled${caseRef}. ${params.details ?? ""}`;
    case "document_signed":
      return `${prefix}A document has been electronically signed${caseRef}. ${params.details ?? ""}`;
    case "payment_receipt":
      return `${prefix}Payment processed${caseRef}. ${params.details ?? ""}`;
    case "general":
    default:
      return `${prefix}${params.details ?? "Notification from TPT Court System."}`;
  }
}

/**
 * Send an SMS notification via Twilio.
 * Returns true if the message was sent successfully.
 */
export async function sendSms(
  to: string,
  template: SmsTemplateType,
  params: SmsMessageParams = {},
): Promise<boolean> {
  if (!SMS_ENABLED) {
    console.warn("[sms] SMS not sent: Twilio not configured (set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER)");
    return false;
  }

  try {
    // Ensure phone number is in E.164 format
    const normalizedTo = to.startsWith("+") ? to : `+${to}`;

    const body = buildMessage(template, params);
    // Truncate to 1600 characters (Twilio max single message)
    const truncatedBody = body.length > 1600 ? body.substring(0, 1597) + "..." : body;

    const client = getClient();
    const message = await client.messages.create({
      body: truncatedBody,
      from: TWILIO_PHONE_NUMBER,
      to: normalizedTo,
    });

    console.log(`[sms] Sent ${template} to ${normalizedTo} (sid: ${message.sid})`);
    return true;
  } catch (error) {
    console.error(`[sms] Failed to send ${template} to ${to}:`, error);
    return false;
  }
}

/**
 * Send SMS to multiple recipients.
 */
export async function sendBulkSms(
  recipients: Array<{ phone: string }>,
  template: SmsTemplateType,
  params: SmsMessageParams = {},
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  for (const recipient of recipients) {
    if (!recipient.phone) {
      failed++;
      continue;
    }
    const ok = await sendSms(recipient.phone, template, params);
    if (ok) sent++;
    else failed++;
  }

  return { sent, failed };
}