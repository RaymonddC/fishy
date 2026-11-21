// Content script for the mail page. Reads the email that is open and passes
// it to the side panel. Nothing is stored and nothing is sent anywhere else.

import { EMAIL_UPDATE, isEmailSync } from '../core/email/messages.ts';
import type { EmailUpdateMessage, OpenEmail } from '../core/email/messages.ts';
import { emailSignature, readOpenEmail } from './gmail-reader.ts';

// The page rebuilds itself constantly, so a slow look is cheaper and steadier
// than reacting to every change. One look is a single query for the open message.
const LOOK_MS = 1500;

let lastSignature = '';
let timer: number | undefined;

function toMessage(email: OpenEmail | null): EmailUpdateMessage {
  return { type: EMAIL_UPDATE, email };
}

function look(): void {
  const email = readOpenEmail(document);
  const signature = emailSignature(email);
  if (signature === lastSignature) {
    return;
  }
  lastSignature = signature;
  try {
    // The side panel may be closed. That is fine: it asks when it opens.
    chrome.runtime.sendMessage(toMessage(email)).catch(() => undefined);
  } catch {
    // The extension was reloaded or removed, so this copy of the script is orphaned.
    window.clearInterval(timer);
  }
}

timer = window.setInterval(look, LOOK_MS);
look();

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (isEmailSync(message)) {
    sendResponse(toMessage(readOpenEmail(document)));
  }
  return false;
});
