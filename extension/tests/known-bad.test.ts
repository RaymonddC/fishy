// R5: "A match shows how often it was seen."
//
// Known bad accounts, numbers and domains are matched on the laptop, against
// a copy of the list. Matching makes no request.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import type { KnownParties } from '../src/core/checks/sender.ts';
import { assessEmail } from '../src/core/email/assess.ts';
import type { OpenEmail } from '../src/core/email/messages.ts';
import { candidatesFromText, createKnownBadIndex, describeMatch, matchKnownBad } from '../src/core/match/known-bad.ts';
import { collectSuspects } from '../src/core/match/suspects.ts';
import { DEFAULT_RULES } from '../src/core/rules/defaults.ts';
import { decide } from '../src/core/rules/engine.ts';

const read = <T>(path: string): T =>
  JSON.parse(readFileSync(new URL(`../../fixtures/${path}`, import.meta.url), 'utf8')) as T;

const knownBad = read<{ entries: { type: 'account' | 'domain' | 'number'; value: string; seenCount: number; note: string }[] }>(
  'known-bad.json',
);
const invoices = read<Record<'genuine' | 'fake', { bank: { accountNumber: string } }>>('gmail/invoices.json');
const fixtureEmail = read<{ from: { name: string; address: string }; subject: string; bodyText: string; links: { text: string; href: string }[] }>(
  'gmail/invoice-email.json',
);
const company = read<{
  company: { name: string; domain: string };
  staff: { name: string }[];
  suppliers: { name: string; domain: string; contact: { name: string } }[];
}>('company.json');

const index = createKnownBadIndex(knownBad.entries);
const none = { accounts: [], domains: [], numbers: [] };

test('the fake invoice account is on the list, and the match says it was seen in 2 confirmed scams', () => {
  const [match, ...others] = matchKnownBad(index, { ...none, accounts: [invoices.fake.bank.accountNumber] });

  assert.deepEqual(others, []);
  assert.equal(match?.type, 'account');
  assert.equal(match?.seenCount, 2);
  assert.equal(match?.signal.type, 'known_bad_account');
  assert.equal(match?.signal.detail, 'Seen in 2 confirmed scams');
  assert.equal(describeMatch(match), 'This account: 2 confirmed scams');
});

test('one sighting is written in the singular', () => {
  const [match] = matchKnownBad(index, { ...none, domains: ['tessaline-packagings.example'] });

  assert.equal(match?.signal.detail, 'Seen in 1 confirmed scam');
  assert.equal(describeMatch(match), 'This domain: 1 confirmed scam');
});

test('an account matches however it is spaced', () => {
  for (const written of ['9920 5844 16', '9920-584-416', ' 9920584416 ']) {
    assert.equal(matchKnownBad(index, { ...none, accounts: [written] }).length, 1, written);
  }
});

test('a domain matches in any case, and so does anything under it', () => {
  for (const written of ['Tessaline-Packagings.EXAMPLE', 'portal.tessaline-packagings.example']) {
    assert.equal(matchKnownBad(index, { ...none, domains: [written] })[0]?.type, 'domain', written);
  }
  assert.deepEqual(matchKnownBad(index, { ...none, domains: ['nottessaline-packagings.example'] }), []);
});

test('a phone number matches however it is written', () => {
  const [match] = matchKnownBad(index, { ...none, numbers: ['+1 (202) 555-0162'] });

  assert.equal(match?.signal.type, 'known_bad_number');
});

test('the genuine supplier account and domains are not on the list', () => {
  const found = matchKnownBad(index, {
    accounts: [invoices.genuine.bank.accountNumber],
    domains: company.suppliers.map((supplier) => supplier.domain).concat(company.company.domain),
    numbers: [],
  });

  assert.deepEqual(found, []);
});

test('the same detail given twice is reported once', () => {
  const found = matchKnownBad(index, { ...none, accounts: ['9920584416', '9920 5844 16'] });

  assert.equal(found.length, 1);
});

test('the copy of the list holds details and counts only, not notes or message text', () => {
  const text = JSON.stringify([...index.values()]);

  for (const entry of knownBad.entries) {
    assert.ok(!text.includes(entry.note));
  }
});

test('finds account numbers and phone numbers written in a message, and not amounts or invoice numbers', () => {
  const found = candidatesFromText(`${fixtureEmail.bodyText}\nCall our accounts line on +1 202 555 0162.`);

  assert.deepEqual(found.accounts, ['9920584416']);
  assert.deepEqual(found.numbers, ['+12025550162']);
});

const KNOWN: KnownParties = {
  companyName: company.company.name,
  companyDomain: company.company.domain,
  staffNames: company.staff.map((person) => person.name),
  suppliers: company.suppliers.map((supplier) => ({ name: supplier.name, domain: supplier.domain, contactName: supplier.contact.name })),
};
const EMAIL: OpenEmail = {
  id: 'm1',
  sender: fixtureEmail.from,
  subject: fixtureEmail.subject,
  bodyText: fixtureEmail.bodyText,
  links: fixtureEmail.links,
  attachments: [],
};

test('the fake supplier email matches the list twice: its sender domain and the account it asks to be paid on', () => {
  const assessment = assessEmail(EMAIL, KNOWN, index);
  const types = assessment.signals.map((signal) => signal.type);

  assert.ok(types.includes('known_bad_domain'));
  assert.ok(types.includes('known_bad_account'));
  const account = assessment.signals.find((signal) => signal.type === 'known_bad_account');
  assert.equal(account?.detail, 'Seen in 2 confirmed scams');
  assert.ok(decide(assessment.signals, DEFAULT_RULES).matched.includes('known_bad_detail'));
});

test('without a copy of the list, the email is assessed as before', () => {
  const types = assessEmail(EMAIL, KNOWN).signals.map((signal) => signal.type);

  assert.ok(!types.some((type) => type.startsWith('known_bad')));
});

test('the details to report for a phone check are details only: domains, accounts and numbers', () => {
  const assessment = assessEmail(EMAIL, KNOWN, index);
  const suspects = collectSuspects({ email: { assessment, bodyText: EMAIL.bodyText, senderAddress: EMAIL.sender.address } });

  assert.deepEqual(suspects.accounts, ['9920584416']);
  assert.ok(suspects.domains.includes('tessaline-packagings.example'));
  assert.deepEqual(suspects.numbers, []);
  assert.ok(!suspects.domains.includes('tessaline-packaging.example'), 'a genuine domain is never reported');
  assert.ok(!JSON.stringify(suspects).includes('Dear Laras'));
});

test('matching makes no network request, and the matching code has no way to make one', () => {
  const realFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = (async () => {
    requests += 1;
    throw new Error('no network in this test');
  }) as typeof fetch;
  try {
    matchKnownBad(index, { accounts: ['9920584416'], domains: ['tessaline-packagings.example'], numbers: ['+12025550162'] });
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(requests, 0);

  for (const file of ['known-bad.ts', 'suspects.ts']) {
    const source = readFileSync(new URL(`../src/core/match/${file}`, import.meta.url), 'utf8');
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|firebase/.test(source), file);
  }
});
