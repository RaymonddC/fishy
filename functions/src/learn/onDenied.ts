// Shared learning: when the real person says "not me" and confirms it with
// their PIN, the details of that request join the known-bad list, or their
// count goes up.
//
// The PIN is what makes this safe. Without it, anyone who could start a check
// could teach the list anything. And whatever is reported, the company's own
// domain and its suppliers' domains and accounts can never be added.

import type { CheckDeps, KnownBadKey, Verification } from '../call/ports.ts';

function digitsOf(value: string): string {
  return value.replace(/\D/g, '');
}

export async function learnFromDenial(deps: CheckDeps, verification: Verification): Promise<number> {
  if (verification.status !== 'denied' || !verification.pinVerified) {
    return 0;
  }
  const suspects = await deps.store.getSuspects(verification.id);
  if (!suspects) {
    return 0;
  }
  const genuine = await deps.store.protectedValues();
  const genuineAccounts = new Set(genuine.accounts.map(digitsOf));
  const isGenuineDomain = (domain: string): boolean =>
    genuine.domains.some((known) => domain === known || domain.endsWith(`.${known}`));

  const entries: KnownBadKey[] = [
    ...suspects.accounts.filter((account) => !genuineAccounts.has(account)).map((value) => ({ type: 'account' as const, value })),
    ...suspects.domains.filter((domain) => !isGenuineDomain(domain)).map((value) => ({ type: 'domain' as const, value })),
    ...suspects.numbers.map((value) => ({ type: 'number' as const, value })),
  ];
  if (entries.length > 0) {
    await deps.store.raiseKnownBad(entries, deps.now());
  }
  return entries.length;
}
