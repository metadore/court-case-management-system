export interface SmsProvider {
  readonly type: string;
  send(to: string, body: string): Promise<{ messageId: string }>;
}

export interface EmailSendOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailProvider {
  readonly type: string;
  send(options: EmailSendOptions): Promise<{ messageId: string }>;
}
