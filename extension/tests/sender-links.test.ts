// R3: checks on who sent an email and where its links really go.
// Everything here runs on the laptop: these functions make no requests.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { checkLinks, stripQuery } from '../src/core/checks/links.ts';
import { checkSender } from '../src/core/checks/sender.ts';
import type { KnownParties } from '../src/core/checks/sender.ts';

const read = <T>(path: string): T =>
  JSON.parse(readFileSync(new URL(`../../fixtures/${path}`, import.meta.url), 'utf8')) as T;

const company = read<{
  company: { domain: string };
  staff: { name: string }[];
  suppliers: { name: string; domain: string; contact: { name: string } }[];
}>('company.json');
const email = read<{ from: { name: string; address: string }; links: { text: string; href: string }[] }>(
  'gmail/invoice-email.json',
);

const KNOWN: KnownParties = {
  companyDomain: company.company.domain,
  staffNames: company.staff.map((person) => person.name),
  suppliers: company.suppliers.map((supplier) => ({
    name: supplier.name,
    domain: supplier.domain,
    contactName: supplier.contact.name,
  })),
};
const GENUINE = [KNOWN.companyDomain, ...KNOWN.suppliers.map((supplier) => supplier.domain)];

const types = (signals: { type: string }[]): string[] => signals.map((signal) => signal.type).sort();

test('the fake supplier email: lookalike domain, and a known name on the wrong address', () => {
  const signals = checkSender(email.from, KNOWN);

  assert.deepEqual(types(signals), ['sender_lookalike_domain', 'sender_name_mismatch']);
  const lookalike = signals.find((signal) => signal.type === 'sender_lookalike_domain');
  assert.ok(lookalike?.detail?.includes('tessaline-packagings.example'));
  assert.ok(lookalike?.detail?.includes('tessaline-packaging.example'));
});

test('a genuine supplier contact raises nothing', () => {
  assert.deepEqual(checkSender({ name: 'Yoga Permana', address: 'yoga.permana@tessaline-packaging.example' }, KNOWN), []);
});

test('a colleague on the company domain raises nothing', () => {
  assert.deepEqual(checkSender({ name: 'Budi Prakoso', address: 'budi.prakoso@ombakura-freight.example' }, KNOWN), []);
});

test('a staff name on an outside address is a mismatch', () => {
  const signals = checkSender({ name: 'Budi Prakoso', address: 'budi.prakoso@free-mail.example' }, KNOWN);

  assert.deepEqual(types(signals), ['sender_name_mismatch', 'sender_unknown']);
});

test('a supplier name used as the display name on another domain is a mismatch', () => {
  const signals = checkSender({ name: 'Tessaline Packaging Accounts', address: 'billing@free-mail.example' }, KNOWN);

  assert.ok(types(signals).includes('sender_name_mismatch'));
});

test('a stranger with an unremarkable name is only marked as unknown', () => {
  const signals = checkSender({ name: 'City Water Utility', address: 'bills@city-water-utility.example' }, KNOWN);

  assert.deepEqual(types(signals), ['sender_unknown']);
});

test('the address is compared without regard to case, and a broken address is unknown', () => {
  assert.deepEqual(checkSender({ name: 'Yoga Permana', address: 'Yoga.Permana@Tessaline-Packaging.EXAMPLE' }, KNOWN), []);
  assert.deepEqual(types(checkSender({ name: 'Someone', address: 'not-an-address' }, KNOWN)), ['sender_unknown']);
});

test('the fake email link: the text shows the genuine domain, the link goes to the lookalike', () => {
  const result = checkLinks(email.links, GENUINE);

  assert.deepEqual(types(result.signals), ['link_lookalike_domain', 'link_text_mismatch']);
  const [finding] = result.findings;
  assert.equal(finding?.host, 'portal.tessaline-packagings.example');
  assert.equal(finding?.shownHost, 'portal.tessaline-packaging.example');
  assert.equal(finding?.mismatch, true);
  assert.equal(finding?.lookalike?.target, 'tessaline-packaging.example');
});

test('a link whose text names the place it goes to raises nothing', () => {
  const result = checkLinks(
    [{ text: 'portal.tessaline-packaging.example/invoices', href: 'https://portal.tessaline-packaging.example/invoices/TP-2026-045' }],
    GENUINE,
  );

  assert.deepEqual(result.signals, []);
});

test('link text without an address in it, such as "View invoice", is not a mismatch', () => {
  const result = checkLinks([{ text: 'View invoice', href: 'https://portal.tessaline-packaging.example/invoices' }], GENUINE);

  assert.deepEqual(result.signals, []);
  assert.equal(result.findings[0]?.shownHost, null);
});

test('text that shows a parent domain of where the link goes is not a mismatch', () => {
  const result = checkLinks(
    [{ text: 'tessaline-packaging.example', href: 'https://portal.tessaline-packaging.example/invoices' }],
    GENUINE,
  );

  assert.deepEqual(result.signals, []);
});

test('links that are not web links are ignored', () => {
  const result = checkLinks(
    [
      { text: 'Write to us', href: 'mailto:accounts@tessaline-packaging.example' },
      { text: 'Run this', href: 'javascript:alert(1)' },
      { text: 'Broken', href: 'not a url' },
    ],
    GENUINE,
  );

  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.toCheck, []);
});

test('the addresses handed on for a safety check carry no query, fragment or sign-in details', () => {
  const result = checkLinks(
    [
      { text: 'One', href: 'https://user:secret@files.example.org/a/b?invoice=TP-2026-047&token=abc#section' },
      { text: 'Same again', href: 'https://files.example.org/a/b?other=1' },
      { text: 'Two', href: 'http://files.example.org/c' },
    ],
    GENUINE,
  );

  assert.deepEqual(result.toCheck, ['https://files.example.org/a/b', 'http://files.example.org/c']);
});

test('at most ten addresses are handed on for a safety check', () => {
  const many = Array.from({ length: 25 }, (_unused, index) => ({ text: 'x', href: `https://files.example.org/${index}` }));

  assert.equal(checkLinks(many, GENUINE).toCheck.length, 10);
});

test('stripQuery keeps the scheme, host, port and path, and refuses anything that is not a web address', () => {
  assert.equal(stripQuery('https://files.example.org:8443/a/b?x=1#y'), 'https://files.example.org:8443/a/b');
  assert.equal(stripQuery('ftp://files.example.org/a'), null);
  assert.equal(stripQuery('nonsense'), null);
});
