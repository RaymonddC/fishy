// What the side panel works out about an opened email, on the laptop.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import type { KnownParties } from '../src/core/checks/sender.ts';
import { assessEmail } from '../src/core/email/assess.ts';
import type { OpenEmail } from '../src/core/email/messages.ts';

const read = <T>(path: string): T =>
  JSON.parse(readFileSync(new URL(`../../fixtures/${path}`, import.meta.url), 'utf8')) as T;

const fixture = read<{ from: { name: string; address: string }; subject: string; bodyText: string; links: { text: string; href: string }[] }>(
  'gmail/invoice-email.json',
);
const company = read<{
  company: { name: string; domain: string };
  staff: { name: string }[];
  suppliers: { name: string; domain: string; contact: { name: string } }[];
}>('company.json');

const KNOWN: KnownParties = {
  companyName: company.company.name,
  companyDomain: company.company.domain,
  staffNames: company.staff.map((person) => person.name),
  suppliers: company.suppliers.map((supplier) => ({ name: supplier.name, domain: supplier.domain, contactName: supplier.contact.name })),
};
const EMAIL: OpenEmail = {
  id: 'm1',
  sender: fixture.from,
  subject: fixture.subject,
  bodyText: fixture.bodyText,
  links: fixture.links,
  attachments: [],
};

test('the fake supplier email gets four red flags and one address to check', () => {
  const result = assessEmail(EMAIL, KNOWN);

  assert.deepEqual(result.signals.map((signal) => signal.type).sort(), [
    'link_lookalike_domain',
    'link_text_mismatch',
    'sender_lookalike_domain',
    'sender_name_mismatch',
  ]);
  assert.deepEqual(result.toCheck, ['https://portal.tessaline-packagings.example/invoices/TP-2026-047']);
  assert.equal(result.knownPartiesAvailable, true);
});

test('without the list of known parties, the sender is not judged but a misleading link is still found', () => {
  const result = assessEmail(EMAIL, null);

  assert.deepEqual(result.signals.map((signal) => signal.type), ['link_text_mismatch']);
  assert.equal(result.knownPartiesAvailable, false);
});

test('a genuine supplier email gets no flags', () => {
  const genuine: OpenEmail = {
    ...EMAIL,
    sender: { name: 'Yoga Permana', address: 'yoga.permana@tessaline-packaging.example' },
    links: [{ text: 'portal.tessaline-packaging.example/invoices', href: 'https://portal.tessaline-packaging.example/invoices/TP-2026-046' }],
  };

  assert.deepEqual(assessEmail(genuine, KNOWN).signals, []);
});

test('the names to remove before the text may go to the cloud include the sender and everyone known', () => {
  const names = assessEmail(EMAIL, KNOWN).namesToRedact;

  for (const name of ['Yoga Permana', 'Yoga', 'Budi Prakoso', 'Laras Pramesti', 'Tessaline Packaging', 'Ombakura Freight', 'Ombakura']) {
    assert.ok(names.includes(name), `${name} should be redacted`);
  }
});
