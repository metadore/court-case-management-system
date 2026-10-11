import { Vonage } from "@vonage/server-sdk";
import type { SmsProvider } from "../base.js";

export class VonageSmsProvider implements SmsProvider {
  readonly type = "VONAGE";
  private client: Vonage;
  private from: string;

  constructor(config: Record<string, string>) {
    if (!config["apiKey"] || !config["apiSecret"] || !config["from"]) {
      throw new Error("Vonage config requires apiKey, apiSecret, and from");
    }
    this.client = new Vonage({ apiKey: config["apiKey"], apiSecret: config["apiSecret"] });
    this.from = config["from"];
  }

  async send(to: string, body: string): Promise<{ messageId: string }> {
    const response = await this.client.sms.send({ to, from: this.from, text: body });
    const msg = response.messages[0];
    if (!msg) throw new Error("Vonage returned empty messages array");
    if (msg.status !== "0") {
      throw new Error(`Vonage SMS failed (status ${msg.status}): ${(msg as Record<string, unknown>)["error-text"] ?? "unknown error"}`);
    }
    return { messageId: (msg as Record<string, unknown>)["message-id"] as string ?? "" };
  }
}
