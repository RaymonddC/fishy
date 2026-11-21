// The shapes of the fixture files, a loader, and the rules that keep the
// fixtures synthetic. Used by the fixture checks, the generator and the seed
// script.

import { readFileSync } from 'node:fs';

const ROOT = new URL('../fixtures/', import.meta.url);

export interface BankDetails {
  bankName: string;
  accountName: string;
  accountNumber: string;
}

export interface HistoryEntry {
  invoiceNumber: string;
  date: string;
  amount: number;
  currency: string;
  bankName: string;
  accountNumber: string;
}

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  email: string;
  /** 1 is asked first, 2 is asked next if 1 does not answer. Null: not an approver. */
  approverOrder: number | null;
}

export interface Supplier {
  id: string;
  name: string;
  domain: string;
  contact: { name: string; email: string };
  bank: BankDetails;
  invoiceHistory: HistoryEntry[];
}

export interface Company {
  company: { id: string; name: string; domain: string };
  staff: StaffMember[];
  suppliers: Supplier[];
}

export interface Invoice {
  supplierId: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  amount: number;
  billTo: string;
  lines: { description: string; quantity: number; unitPrice: number }[];
  bank: BankDetails;
  pdf: { file: string; producer: string; createdAt: string; modifiedAt: string };
}

export interface Link {
  text: string;
  href: string;
}

export interface Email {
  from: { name: string; address: string };
  replyTo: string;
  to: { name: string; address: string }[];
  subject: string;
  sentAt: string;
  bodyText: string;
  links: Link[];
  attachments: { filename: string; fixture: string }[];
}

export interface Lookalikes {
  genuine: string[];
  unrelated: string[];
  lookalikes: { domain: string; target: string; technique: string }[];
}

export interface KnownBadEntry {
  type: 'account' | 'domain' | 'number';
  value: string;
  seenCount: number;
  firstSeen: string;
  note: string;
}

export interface KnownBad {
  entries: KnownBadEntry[];
}

export interface Replay {
  lines: { atMs: number; speaker: string; text: string }[];
}

export interface BenignEmail {
  id: string;
  kind: 'email';
  from: { name: string; address: string };
  to: string;
  subject: string;
  body: string;
  links: Link[];
  expected: 'not_fishy';
  /** True for ordinary messages that use words a scam also uses, such as "urgent" or "confidential". */
  hard: boolean;
}

export interface BenignMeeting {
  id: string;
  kind: 'meeting';
  lines: { speaker: string; text: string }[];
  expected: 'not_fishy';
  hard: boolean;
}

export type BenignMessage = BenignEmail | BenignMeeting;

export interface BenignInvoice {
  id: string;
  supplierId: string;
  invoiceNumber: string;
  issueDate: string;
  amount: number;
  currency: string;
  bankName: string;
  accountNumber: string;
  expected: 'not_fishy';
}

export interface Fixtures {
  company: Company;
  invoices: { genuine: Invoice; fake: Invoice };
  email: Email;
  lookalikes: Lookalikes;
  knownBad: KnownBad;
  replay: Replay;
  benignMessages: { items: BenignMessage[] };
  benignInvoices: { items: BenignInvoice[] };
}

function read<T>(path: string, fallback?: T): T {
  try {
    return JSON.parse(readFileSync(new URL(path, ROOT), 'utf8')) as T;
  } catch (error) {
    if (fallback !== undefined) {
      return fallback;
    }
    throw error;
  }
}

export function loadFixtures(): Fixtures {
  return {
    company: read('company.json'),
    invoices: read('gmail/invoices.json'),
    email: read('gmail/invoice-email.json'),
    lookalikes: read('lookalikes.json'),
    knownBad: read('known-bad.json'),
    replay: read('meet/captions-replay.json'),
    // These two are generated. Before the first run they do not exist yet.
    benignMessages: read('benign/messages.json', { items: [] }),
    benignInvoices: read('benign/invoices.json', { items: [] }),
  };
}

// Top-level names that are reserved and can never be registered.
const RESERVED_ENDINGS = ['.example', '.test', '.invalid', '.localhost'];
const RESERVED_DOMAINS = ['example.com', 'example.net', 'example.org'];
const FILE_ENDINGS = /\.(pdf|json|md|html|ts|js|png|svg|css)$/i;

export function isReservedDomain(domain: string): boolean {
  const lower = domain.toLowerCase();
  return (
    RESERVED_ENDINGS.some((ending) => lower.endsWith(ending)) ||
    RESERVED_DOMAINS.some((reserved) => lower === reserved || lower.endsWith(`.${reserved}`))
  );
}

/** Every domain-like token in a text: in addresses, in links and on its own. File names are skipped. */
export function findDomains(text: string): string[] {
  const found = new Set<string>();
  const withoutLocalParts = text.replace(/[\w.+-]+@((?:[a-z0-9-]+\.)+[a-z]{2,})/gi, (_match, domain: string) => {
    found.add(domain.toLowerCase());
    return ' ';
  });
  for (const [token] of withoutLocalParts.matchAll(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/gi)) {
    if (!FILE_ENDINGS.test(token)) {
      found.add(token.toLowerCase());
    }
  }
  return [...found];
}

/** Anything shaped like a phone number: international with "+", or a local number starting with 0. */
export function findPhoneNumbers(text: string): string[] {
  return [...text.matchAll(/\+\d[\d\s().-]{6,}\d|\b0\d{2,3}[\s.-]?\d{3,4}[\s.-]?\d{3,5}\b/g)].map(([match]) => match);
}

/** True for +1 202 555 01xx, a range set aside for fiction. */
export function fictionalPhone(number: string): boolean {
  return /^120255501\d{2}$/.test(number.replace(/\D/g, ''));
}
