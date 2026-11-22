// Takes the details of a suspicious request from the person who started a
// phone check: the domains, account numbers and phone numbers in it.
//
// Details only. Each one must have the exact shape of what it claims to be,
// so the text of a message cannot be stored here by accident or on purpose.
// They are kept beside the check and used only if the real person says
// "not me" and confirms it with their PIN.

import { RECORD_ID, RequestError } from '../call/ports.ts';
import type { CheckDeps, Suspects } from '../call/ports.ts';

const MOST_PER_KIND = 10;
const ACCOUNT_AS_WRITTEN = /^[\d\s-]+$/;
const DOMAIN = /^(?:[a-z0-9¡-￿-]{1,63}\.)+[a-z¡-￿]{2,63}$/;
const INTERNATIONAL = /^\+[1-9]\d{7,14}$/;
const KINDS = ['accounts', 'domains', 'numbers'] as const;

const refuse = (message: string): never => {
  throw new RequestError('invalid-argument', message);
};

function tidyAccount(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (!ACCOUNT_AS_WRITTEN.test(value) || digits.length < 6 || digits.length > 20) {
    refuse('An account must be 6 to 20 digits.');
  }
  return digits;
}

function tidyDomain(value: string): string {
  const domain = value.trim().toLowerCase().replace(/\.+$/, '');
  if (domain.length > 253 || !DOMAIN.test(domain)) {
    refuse('A domain must be a domain name and nothing else.');
  }
  return domain;
}

function tidyNumber(value: string): string {
  const number = value.replace(/[\s().-]/g, '');
  if (!INTERNATIONAL.test(number)) {
    refuse('A phone number must be in international format.');
  }
  return number;
}

export function parseSuspects(value: unknown): Suspects {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return refuse('Send accounts, domains and numbers.');
  }
  const fields = value as Record<string, unknown>;
  if (Object.keys(fields).some((key) => !(KINDS as readonly string[]).includes(key))) {
    return refuse('Only accounts, domains and numbers are accepted. The text of a message may not be sent.');
  }
  const list = (kind: (typeof KINDS)[number], tidy: (item: string) => string): string[] => {
    const items = fields[kind] ?? [];
    if (!Array.isArray(items) || items.length > MOST_PER_KIND || !items.every((item) => typeof item === 'string')) {
      return refuse(`${kind} must be a list of at most ${MOST_PER_KIND} entries.`);
    }
    return [...new Set((items as string[]).map(tidy))];
  };
  return {
    accounts: list('accounts', tidyAccount),
    domains: list('domains', tidyDomain),
    numbers: list('numbers', tidyNumber),
  };
}

export async function reportSuspects(deps: CheckDeps, caller: { uid: string } | null, data: unknown): Promise<{ kept: number }> {
  if (!caller) {
    throw new RequestError('unauthenticated', 'Sign in first.');
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return refuse('Send verificationId and suspects.');
  }
  const fields = data as Record<string, unknown>;
  if (Object.keys(fields).some((key) => key !== 'verificationId' && key !== 'suspects')) {
    return refuse('Only verificationId and suspects are accepted.');
  }
  const { verificationId } = fields;
  if (typeof verificationId !== 'string' || !RECORD_ID.test(verificationId)) {
    return refuse('verificationId is missing or not valid.');
  }
  const verification = await deps.store.getVerification(verificationId);
  if (!verification) {
    throw new RequestError('not-found', 'There is no such check.');
  }
  if (verification.requesterUid !== caller.uid) {
    throw new RequestError('permission-denied', 'Only the person who started a check may add details to it.');
  }
  const open =
    verification.status === 'waiting' ||
    verification.status === 'awaiting_pin' ||
    (verification.status === 'denied' && !verification.pinVerified);
  if (!open) {
    return refuse('This check is already closed.');
  }
  const suspects = parseSuspects(fields.suspects);
  await deps.store.saveSuspects(verificationId, suspects);
  return { kept: suspects.accounts.length + suspects.domains.length + suspects.numbers.length };
}
