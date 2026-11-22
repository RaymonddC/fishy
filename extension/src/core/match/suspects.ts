// The details of a suspicious request, to hand to the server when a phone
// check starts. If the real person then says "not me" and confirms with
// their PIN, these join the known-bad list.
//
// Details only: domains, account numbers and phone numbers. Never the text of
// the message. The server checks the shapes again and refuses anything else.

import type { InvoiceCheck } from '../checks/invoice.ts';
import { normaliseDomain } from '../checks/lookalike.ts';
import type { EmailAssessment } from '../email/assess.ts';
import { candidatesFromText } from './known-bad.ts';

export interface Suspects {
  accounts: string[];
  domains: string[];
  numbers: string[];
}

export interface SuspectSources {
  email?: { assessment: EmailAssessment; bodyText: string; senderAddress: string };
  invoice?: InvoiceCheck;
}

const MOST = 5;

function domainOf(address: string): string | null {
  const at = address.lastIndexOf('@');
  return at > 0 && at < address.length - 1 ? normaliseDomain(address.slice(at + 1)) : null;
}

export function collectSuspects(sources: SuspectSources): Suspects {
  const accounts = new Set<string>();
  const domains = new Set<string>();
  const numbers = new Set<string>();

  const { email, invoice } = sources;
  if (email) {
    const flagged = email.assessment.signals.map((signal) => signal.type);
    const sender = domainOf(email.senderAddress);
    // The sender's domain only when it was flagged, so a genuine domain is never reported.
    if (sender && (flagged.includes('sender_lookalike_domain') || flagged.includes('known_bad_domain'))) {
      domains.add(sender);
    }
    for (const link of email.assessment.links) {
      if (link.lookalike) {
        domains.add(link.host);
      }
    }
    const written = candidatesFromText(email.bodyText);
    written.accounts.forEach((account) => accounts.add(account));
    written.numbers.forEach((number) => numbers.add(number));
  }
  if (invoice?.fields.accountNumber && invoice.signals.some((signal) => signal.type === 'bank_account_changed')) {
    accounts.add(invoice.fields.accountNumber);
  }

  return {
    accounts: [...accounts].slice(0, MOST),
    domains: [...domains].slice(0, MOST),
    numbers: [...numbers].slice(0, MOST),
  };
}
