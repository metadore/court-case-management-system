import sgMail from "@sendgrid/mail";
import type { EmailProvider, EmailSendOptions } from "../base.js";

export class SendGridEmailProvider implements EmailProvider {
  readonly type = "SENDGRID";
  private from: string;

  constructor(config: Record<string, string>) {
    if (!config["apiKey"] || !config["from"]) {
      throw new Error("SendGrid config requires apiKey and from");
    }
    sgMail.setApiKey(config["apiKey"]);
    this.from = config["from"];
  }

  async send({ to, subject, html, text }: EmailSendOptions): Promise<{ messageId: string }> {
    const [response] = await sgMail.send({ to, from: this.from, subject, html, text });
    const messageId = (response.headers as Record<string, string>)["x-message-id"] ?? "";
    return { messageId };
  }
}
