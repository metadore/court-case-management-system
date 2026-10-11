import { Resend } from "resend";
import type { EmailProvider, EmailSendOptions } from "../base.js";

export class ResendEmailProvider implements EmailProvider {
  readonly type = "RESEND";
  private client: Resend;
  private from: string;

  constructor(config: Record<string, string>) {
    if (!config["apiKey"] || !config["from"]) {
      throw new Error("Resend config requires apiKey and from");
    }
    this.client = new Resend(config["apiKey"]);
    this.from = config["from"];
  }

  async send({ to, subject, html, text }: EmailSendOptions): Promise<{ messageId: string }> {
    const { data, error } = await this.client.emails.send({
      from: this.from,
      to,
      subject,
      html,
      text,
    });
    if (error) throw new Error(`Resend error: ${error.message}`);
    return { messageId: data?.id ?? "" };
  }
}
