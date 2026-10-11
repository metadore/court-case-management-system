import twilio from "twilio";
import type { SmsProvider } from "../base.js";

export class TwilioSmsProvider implements SmsProvider {
  readonly type = "TWILIO";
  private client: ReturnType<typeof twilio>;
  private from: string;

  constructor(config: Record<string, string>) {
    if (!config["accountSid"] || !config["authToken"] || !config["fromNumber"]) {
      throw new Error("Twilio config requires accountSid, authToken, and fromNumber");
    }
    this.client = twilio(config["accountSid"], config["authToken"]);
    this.from = config["fromNumber"];
  }

  async send(to: string, body: string): Promise<{ messageId: string }> {
    const msg = await this.client.messages.create({ to, from: this.from, body });
    return { messageId: msg.sid };
  }
}
