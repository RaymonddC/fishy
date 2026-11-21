// Everything the laptop can work out about an opened email without asking
// anyone: who it claims to be from, and where its links really go.

import { checkLinks } from '../checks/links.ts';
import type { LinkFinding } from '../checks/links.ts';
import { checkSender } from '../checks/sender.ts';
import type { KnownParties } from '../checks/sender.ts';
import type { Signal } from '../rules/engine.ts';
import type { OpenEmail } from './messages.ts';

export interface EmailAssessment {
  signals: Signal[];
  links: LinkFinding[];
  /** Addresses to check against the unsafe-sites list, already stripped. */
  toCheck: string[];
  /** False when the company's known domains could not be loaded, so the sender was not judged. */
  knownPartiesAvailable: boolean;
  /** Names to remove before the email's text may go to the cloud. */
  namesToRedact: string[];
}

function withParts(names: readonly string[]): string[] {
  const all = new Set<string>();
  for (const name of names) {
    const tidy = name.trim();
    if (tidy === '') {
      continue;
    }
    all.add(tidy);
    for (const part of tidy.split(/\s+/)) {
      if (part.length >= 3) {
        all.add(part);
      }
    }
  }
  return [...all];
}

/** @param known The company's own domain and people and its suppliers, or null if they could not be loaded. */
export function assessEmail(email: OpenEmail, known: KnownParties | null): EmailAssessment {
  const genuine = known ? [known.companyDomain, ...known.suppliers.map((supplier) => supplier.domain)] : [];
  const links = checkLinks(email.links, genuine);
  const sender = known ? checkSender(email.sender, known) : [];
  return {
    signals: [...sender, ...links.signals],
    links: links.findings,
    toCheck: links.toCheck,
    knownPartiesAvailable: known !== null,
    namesToRedact: withParts([
      email.sender.name,
      ...(known?.staffNames ?? []),
      ...(known?.suppliers.flatMap((supplier) => [supplier.name, supplier.contactName]) ?? []),
      known?.companyName ?? '',
    ]),
  };
}
