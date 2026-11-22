// The "Opened email" card: who the open email claims to be from, where its
// links really go, and whether any link is on a list of suspected unsafe
// sites. The sender and link checks run on the laptop. Only stripped link
// addresses are sent anywhere, one at a time, for the list check.

import type { KnownParties } from '../core/checks/sender.ts';
import type { LinkSafety } from '../core/checks/link-safety.ts';
import { assessEmail } from '../core/email/assess.ts';
import type { EmailAssessment } from '../core/email/assess.ts';
import { EMAIL_SYNC, isEmailUpdate } from '../core/email/messages.ts';
import type { EmailSyncRequest, OpenEmail } from '../core/email/messages.ts';
import { describeSignal } from '../core/rules/engine.ts';
import { flagItem } from './flags.ts';

export interface EmailPanelElements {
  status: HTMLElement;
  from: HTMLElement;
  flags: HTMLElement;
  linkStatus: HTMLElement;
  attachment: HTMLElement;
  advisory: HTMLAnchorElement;
  check: HTMLButtonElement;
}

export interface EmailPanelDeps {
  known(): Promise<KnownParties | null>;
  checkLink(url: string): Promise<LinkSafety>;
  /** Run the wording check on the email's text. */
  onCheck(email: OpenEmail, assessment: EmailAssessment): void;
}

const NO_EMAIL = 'Open an email to check its sender and links';

export function startEmailPanel(ui: EmailPanelElements, deps: EmailPanelDeps): { refresh(): void } {
  let current: { email: OpenEmail; assessment: EmailAssessment } | null = null;
  let lastEmail: OpenEmail | null = null;
  let run = 0;

  function clear(): void {
    current = null;
    ui.status.textContent = NO_EMAIL;
    ui.from.hidden = true;
    ui.flags.hidden = true;
    ui.linkStatus.hidden = true;
    ui.attachment.hidden = true;
    ui.advisory.hidden = true;
    ui.check.hidden = true;
  }

  async function checkLinksAgainstList(assessment: EmailAssessment, thisRun: number): Promise<void> {
    if (assessment.toCheck.length === 0) {
      ui.linkStatus.hidden = true;
      return;
    }
    ui.linkStatus.hidden = false;
    ui.linkStatus.textContent = 'Checking the links against a list of suspected unsafe sites';
    let listed: LinkSafety | null = null;
    let failed = false;
    for (const url of assessment.toCheck) {
      try {
        const result = await deps.checkLink(url);
        if (result.match) {
          listed ??= result;
        }
      } catch {
        failed = true;
      }
      if (thisRun !== run) {
        return; // A different email is open now. Drop these results.
      }
    }
    if (listed) {
      ui.flags.append(flagItem(describeSignal('link_unsafe'), new URL(listed.checked).hostname));
      ui.flags.hidden = false;
      ui.linkStatus.textContent = 'A link in this email may be unsafe';
      if (listed.advisory?.url.startsWith('https://')) {
        ui.advisory.textContent = listed.advisory.text;
        ui.advisory.href = listed.advisory.url;
        ui.advisory.hidden = false;
      }
    } else if (failed) {
      ui.linkStatus.textContent = 'The links could not be checked against the list of suspected unsafe sites';
    } else {
      const count = assessment.toCheck.length;
      ui.linkStatus.textContent = `${count === 1 ? '1 link' : `${count} links`} checked against a list of suspected unsafe sites. None is listed`;
    }
  }

  async function show(email: OpenEmail | null): Promise<void> {
    lastEmail = email;
    run += 1;
    const thisRun = run;
    if (!email) {
      clear();
      return;
    }
    const known = await deps.known();
    if (thisRun !== run) {
      return;
    }
    const assessment = assessEmail(email, known);
    current = { email, assessment };

    ui.from.textContent = `From ${email.sender.name || 'no name'} <${email.sender.address}>`;
    ui.from.hidden = false;
    ui.flags.replaceChildren(...assessment.signals.map((signal) => flagItem(describeSignal(signal.type), signal.detail)));
    ui.flags.hidden = assessment.signals.length === 0;
    ui.advisory.hidden = true;
    ui.check.hidden = false;
    const pdfs = email.attachments.filter((item) => item.filename.toLowerCase().endsWith('.pdf'));
    ui.attachment.hidden = pdfs.length === 0;
    ui.attachment.textContent =
      pdfs.length === 0
        ? ''
        : `Attached: ${pdfs.map((item) => item.filename).join(', ')}. To check it, download it and add it to the Invoice card below`;

    const found = assessment.signals.length;
    if (!assessment.knownPartiesAvailable) {
      const links = found === 0 ? 'Nothing unusual about the links' : `${found === 1 ? '1 red flag' : `${found} red flags`} in the links`;
      ui.status.textContent = `${links}. The company’s known domains could not be read, so the sender was not judged`;
    } else if (found === 0) {
      ui.status.textContent = 'Nothing unusual about the sender or the links';
    } else {
      ui.status.textContent = `${found === 1 ? '1 red flag' : `${found} red flags`} in the sender and the links`;
    }

    await checkLinksAgainstList(assessment, thisRun);
  }

  chrome.runtime.onMessage.addListener((message: unknown, sender) => {
    // Only this extension's own content script may feed the card.
    if (sender.id === chrome.runtime.id && isEmailUpdate(message)) {
      void show(message.email);
    }
    return false;
  });

  ui.check.addEventListener('click', () => {
    if (current) {
      deps.onCheck(current.email, current.assessment);
    }
  });

  clear();

  // The panel may open with an email already on screen: ask the page.
  void (async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id === undefined) {
        return;
      }
      const request: EmailSyncRequest = { type: EMAIL_SYNC };
      const reply: unknown = await chrome.tabs.sendMessage(tab.id, request);
      if (isEmailUpdate(reply)) {
        await show(reply.email);
      }
    } catch {
      // The active tab is not the mail page, or it was opened before the extension was loaded.
    }
  })();

  // Look at the open email again, for example once sign-in has finished and
  // the company's known domains can be read.
  return { refresh: () => void show(lastEmail) };
}
