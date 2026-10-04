// Outgoing email behind an interface (Build decisions, Leads: provider chosen later). The only
// implementation logs a redacted line: never the recipient, subject or body (they can hold PII).
export type EmailKind = "lead_alert" | "estimate";

export interface EmailMessage {
  kind: EmailKind;
  to: string;
  subject: string;
  text: string;
  /** A non-PII reference for logs (lead or signup ID). */
  refId: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

/** STUB until the owner picks a provider: logs kind and reference only. */
export class LogEmailSender implements EmailSender {
  constructor(private readonly log: (line: string) => void = (l) => console.info(l)) {}
  async send(message: EmailMessage): Promise<void> {
    this.log(`[email] log-only sender (no provider configured): kind=${message.kind} ref=${message.refId}`);
  }
}

/** Collects messages (tests). */
export class MemoryEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];
  async send(message: EmailMessage) {
    this.sent.push(message);
  }
}
