// Checks who an email claims to come from against who the company knows.
// Runs on the laptop and makes no requests.

import type { Signal } from '../rules/engine.ts';
import { findLookalike, isSameOrSubdomain, normaliseDomain } from './lookalike.ts';

/** What the company knows: its own domain and people, and its suppliers. */
export interface KnownParties {
  companyDomain: string;
  staffNames: string[];
  suppliers: { name: string; domain: string; contactName: string }[];
}

export interface Sender {
  /** The display name shown beside the address. */
  name: string;
  address: string;
}

function domainOf(address: string): string | null {
  const at = address.lastIndexOf('@');
  if (at <= 0 || at === address.length - 1) {
    return null;
  }
  const domain = normaliseDomain(address.slice(at + 1));
  return domain.includes('.') ? domain : null;
}

function tidy(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function checkSender(sender: Sender, known: KnownParties): Signal[] {
  const signals: Signal[] = [];
  const domain = domainOf(sender.address);
  const genuine = [known.companyDomain, ...known.suppliers.map((supplier) => supplier.domain)];
  const isOn = (parent: string): boolean => domain !== null && isSameOrSubdomain(domain, normaliseDomain(parent));
  const isKnown = genuine.some(isOn);

  const lookalike = domain !== null && !isKnown ? findLookalike(domain, genuine) : null;
  if (lookalike) {
    signals.push({
      type: 'sender_lookalike_domain',
      detail: `${lookalike.domain} imitates ${lookalike.target}: ${lookalike.reason}`,
    });
  }

  // A name the company knows, on an address that is not theirs.
  const name = tidy(sender.name);
  let mismatch: string | null = null;
  if (name !== '') {
    if (known.staffNames.some((staff) => tidy(staff) === name) && !isOn(known.companyDomain)) {
      mismatch = `The name is a colleague’s, but the address is not on ${known.companyDomain}`;
    }
    for (const supplier of known.suppliers) {
      const usesTheirName = tidy(supplier.contactName) === name || name.includes(tidy(supplier.name));
      if (mismatch === null && usesTheirName && !isOn(supplier.domain)) {
        mismatch = `The name belongs to ${supplier.name}, but the address is not on ${supplier.domain}`;
      }
    }
  }
  if (mismatch !== null) {
    signals.push({ type: 'sender_name_mismatch', detail: mismatch });
  }

  if (!isKnown && !lookalike) {
    signals.push({ type: 'sender_unknown', detail: domain ?? 'The address is not valid' });
  }
  return signals;
}
