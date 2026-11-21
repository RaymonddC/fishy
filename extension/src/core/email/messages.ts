// Messages between the mail page's content script and the side panel.
// The opened email travels only this way, inside the extension.

export interface EmailLink {
  /** What the reader sees. */
  text: string;
  /** Where the link really goes, exactly as written in the message. */
  href: string;
}

export interface EmailAttachment {
  filename: string;
  mimeType: string;
  downloadUrl: string;
}

/** The message that is open on the screen. Never the inbox list. */
export interface OpenEmail {
  id: string;
  sender: { name: string; address: string };
  subject: string;
  bodyText: string;
  links: EmailLink[];
  attachments: EmailAttachment[];
}

/** Content script to side panel: the open email, or null when none is open. */
export const EMAIL_UPDATE = 'fishy/email-update';
/** Side panel to content script: send what is open now. */
export const EMAIL_SYNC = 'fishy/email-sync';

export interface EmailUpdateMessage {
  type: typeof EMAIL_UPDATE;
  email: OpenEmail | null;
}

export interface EmailSyncRequest {
  type: typeof EMAIL_SYNC;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function allText(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => typeof value[key] === 'string');
}

function isOpenEmail(value: unknown): value is OpenEmail {
  if (!isRecord(value) || !allText(value, ['id', 'subject', 'bodyText'])) {
    return false;
  }
  const { sender, links, attachments } = value;
  return (
    isRecord(sender) &&
    allText(sender, ['name', 'address']) &&
    Array.isArray(links) &&
    links.every((link) => isRecord(link) && allText(link, ['text', 'href'])) &&
    Array.isArray(attachments) &&
    attachments.every((item) => isRecord(item) && allText(item, ['filename', 'mimeType', 'downloadUrl']))
  );
}

export function isEmailSync(value: unknown): value is EmailSyncRequest {
  return isRecord(value) && value.type === EMAIL_SYNC;
}

export function isEmailUpdate(value: unknown): value is EmailUpdateMessage {
  return isRecord(value) && value.type === EMAIL_UPDATE && (value.email === null || isOpenEmail(value.email));
}
