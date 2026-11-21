// Reads the email that is open on the mail page.
//
// Opened messages only: it looks at the message on the screen and never at
// the inbox list. It only reads the page. It never changes it, and it has no
// way to reach the network: what it reads is handed to the caller, which
// passes it to the side panel by extension messaging.

import type { EmailAttachment, EmailLink, OpenEmail } from '../core/email/messages.ts';
import { GMAIL_SELECTORS } from './gmail-selectors.ts';

function tidy(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

function findSender(message: Element): { name: string; address: string } | null {
  for (const selector of GMAIL_SELECTORS.sender) {
    const node = message.querySelector(selector);
    const address = tidy(node?.getAttribute(GMAIL_SELECTORS.senderAddressAttribute));
    if (node && address !== '') {
      const name = tidy(node.getAttribute(GMAIL_SELECTORS.senderNameAttribute)) || tidy(node.textContent);
      return { name, address };
    }
  }
  return null;
}

function readLinks(body: Element | null): EmailLink[] {
  if (!body) {
    return [];
  }
  const links: EmailLink[] = [];
  for (const anchor of body.querySelectorAll('a[href]')) {
    // The address as written in the message, not as the page would resolve it.
    const href = anchor.getAttribute('href') ?? '';
    if (href !== '') {
      links.push({ text: tidy(anchor.textContent), href });
    }
  }
  return links;
}

/** The attribute holds "type:file name:address". */
function readAttachments(message: Element): EmailAttachment[] {
  const attachments: EmailAttachment[] = [];
  for (const node of message.querySelectorAll(GMAIL_SELECTORS.attachment)) {
    const match = /^([^:]*):([^:]*):(https?:.+)$/.exec(node.getAttribute(GMAIL_SELECTORS.attachmentAttribute) ?? '');
    const [, mimeType, filename, downloadUrl] = match ?? [];
    if (mimeType !== undefined && filename && downloadUrl) {
      attachments.push({ filename, mimeType, downloadUrl });
    }
  }
  return attachments;
}

/** The message that is open, or null when none is. In a thread, the last open one. */
export function readOpenEmail(root: ParentNode): OpenEmail | null {
  const open = root.querySelectorAll(GMAIL_SELECTORS.message);
  const message = open[open.length - 1];
  if (!message) {
    return null;
  }
  const sender = findSender(message);
  if (!sender) {
    return null;
  }
  const body = message.querySelector(GMAIL_SELECTORS.body);
  return {
    id: message.getAttribute(GMAIL_SELECTORS.messageIdAttribute) ?? '',
    sender,
    subject: tidy(root.querySelector(GMAIL_SELECTORS.subject)?.textContent),
    bodyText: tidy(body?.textContent),
    links: readLinks(body),
    attachments: readAttachments(message),
  };
}

/** A short value that changes whenever what was read changes. Empty when no message is open. */
export function emailSignature(email: OpenEmail | null): string {
  if (!email) {
    return '';
  }
  return [
    email.id,
    email.sender.address,
    email.subject,
    email.bodyText.length,
    email.bodyText.slice(-80),
    email.links.map((link) => link.href).join(' '),
    email.attachments.map((item) => item.filename).join(' '),
  ].join('|');
}
