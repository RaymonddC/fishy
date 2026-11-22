// Matches details against the list of confirmed bad accounts, domains and
// phone numbers. This runs on the laptop, against a copy of the list, and
// makes no request: asking a server "is this account bad?" would tell the
// server which accounts the company is being asked to pay.

import { isSameOrSubdomain, normaliseDomain } from '../checks/lookalike.ts';
import type { Signal } from '../rules/engine.ts';

export type KnownBadType = 'account' | 'domain' | 'number';

export interface KnownBadEntry {
  type: KnownBadType;
  value: string;
  /** In how many confirmed scams this detail was seen. */
  seenCount: number;
}

/** The copy of the list. Details and counts only. */
export type KnownBadIndex = Map<string, KnownBadEntry>;

export interface Candidates {
  accounts: readonly string[];
  domains: readonly string[];
  numbers: readonly string[];
}

export interface KnownBadMatch extends KnownBadEntry {
  signal: Signal;
}

const SIGNAL = {
  account: 'known_bad_account',
  domain: 'known_bad_domain',
  number: 'known_bad_number',
} as const;

function digitsOf(value: string): string {
  return value.replace(/\D/g, '');
}

function tidy(type: KnownBadType, value: string): string {
  if (type === 'account') return digitsOf(value);
  if (type === 'number') return `+${digitsOf(value)}`;
  return normaliseDomain(value);
}

function scams(count: number): string {
  return `${count} confirmed ${count === 1 ? 'scam' : 'scams'}`;
}

export function createKnownBadIndex(entries: readonly KnownBadEntry[]): KnownBadIndex {
  const index: KnownBadIndex = new Map();
  for (const entry of entries) {
    const value = tidy(entry.type, entry.value);
    if (value !== '' && value !== '+') {
      // Only the detail and its count are copied. Notes stay on the server.
      index.set(`${entry.type}:${value}`, { type: entry.type, value, seenCount: entry.seenCount });
    }
  }
  return index;
}

export function matchKnownBad(index: KnownBadIndex, candidates: Candidates): KnownBadMatch[] {
  const found = new Map<string, KnownBadEntry>();
  for (const type of ['account', 'number'] as const) {
    for (const written of type === 'account' ? candidates.accounts : candidates.numbers) {
      const key = `${type}:${tidy(type, written)}`;
      const entry = index.get(key);
      if (entry) {
        found.set(key, entry);
      }
    }
  }
  const domains = [...index.entries()].filter(([, entry]) => entry.type === 'domain');
  for (const written of candidates.domains) {
    const domain = normaliseDomain(written);
    for (const [key, entry] of domains) {
      if (isSameOrSubdomain(domain, entry.value)) {
        found.set(key, entry);
      }
    }
  }
  const order: KnownBadType[] = ['account', 'domain', 'number'];
  return [...found.values()]
    .sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))
    .map((entry) => ({ ...entry, signal: { type: SIGNAL[entry.type], detail: `Seen in ${scams(entry.seenCount)}` } }));
}

/** "This account: 2 confirmed scams". Empty when there is no match. */
export function describeMatch(match: KnownBadMatch | undefined): string {
  return match ? `This ${match.type}: ${scams(match.seenCount)}` : '';
}

/**
 * The account numbers and phone numbers written in a message. Phone numbers
 * are those in international format; what is left that looks like a long
 * number is taken as an account. Amounts and invoice numbers are neither.
 */
export function candidatesFromText(text: string): { accounts: string[]; numbers: string[] } {
  const numbers = new Set<string>();
  const withoutPhones = text.replace(/\+\d[\d\s().-]{6,}\d/g, (match) => {
    numbers.add(tidy('number', match));
    return ' ';
  });
  const accounts = new Set<string>();
  for (const [match] of withoutPhones.matchAll(/(?<![\d,.])\b\d(?:[ -]?\d){7,19}\b(?![,.]?\d)/g)) {
    accounts.add(digitsOf(match));
  }
  return { accounts: [...accounts], numbers: [...numbers] };
}
