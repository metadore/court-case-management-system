import nodemailer from "nodemailer";
import type { EmailProvider, EmailSendOptions } from "../base.js";

export class NodemailerEmailProvider implements EmailProvider {
  readonly type = "NODEMAILER";
  private transporter: nodemailer.Transporter;
  private from: string;

  constructor(config: Record<string, string | number | boolean>) {
    if (!config["host"] || !config["user"] || !config["pass"] || !config["from"]) {
      throw new Error("Nodemailer config requires host, user, pass, and from");
    }
    this.transporter = nodemailer.createTransport({
      host: config["host"] as string,
      port: Number(config["port"] ?? 587),
      secure: Boolean(config["secure"] ?? false),
      auth: {
        user: config["user"] as string,
        pass: config["pass"] as string,
      },
    });
    this.from = config["from"] as string;
  }

  async send({ to, subject, html, text }: EmailSendOptions): Promise<{ messageId: string }> {
    const info = await this.transporter.sendMail({ from: this.from, to, subject, html, text });
    return { messageId: info.messageId };
  }
}
