// R3: "Every lookalike in the test set is flagged."
//
// The test set in fixtures/lookalikes.json was written by hand, technique by
// technique, so it does not mirror the code that has to catch it.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { domainToASCII, domainToUnicode } from 'node:url';

import { findLookalike, isSameOrSubdomain } from '../src/core/checks/lookalike.ts';
import { toUnicodeDomain } from '../src/core/checks/punycode.ts';

interface LookalikeFixture {
  genuine: string[];
  unrelated: string[];
  lookalikes: { domain: string; target: string; technique: string }[];
}

const read = <T>(path: string): T =>
  JSON.parse(readFileSync(new URL(`../../fixtures/${path}`, import.meta.url), 'utf8')) as T;

const fixture = read<LookalikeFixture>('lookalikes.json');
const company = read<{ company: { domain: string }; suppliers: { domain: string }[] }>('company.json');
const benign = read<{ items: { kind: string; from?: { address: string }; links?: { href: string }[] }[] }>(
  'benign/messages.json',
);

// What the extension knows: the company's own domain and its suppliers' domains.
const GENUINE = [company.company.domain, ...company.suppliers.map((supplier) => supplier.domain)];

for (const entry of fixture.lookalikes) {
  test(`flags ${entry.domain} (${entry.technique})`, () => {
    const found = findLookalike(entry.domain, GENUINE);

    assert.ok(found, `${entry.domain} was not flagged`);
    assert.equal(found.target, entry.target);
    assert.ok(found.reason.length > 5, 'the reason is given in plain words');
  });
}

test('the test set has at least 30 lookalikes', () => {
  assert.ok(fixture.lookalikes.length >= 30);
});

test('no genuine domain is flagged, including subdomains of genuine domains', () => {
  for (const domain of fixture.genuine) {
    assert.equal(findLookalike(domain, GENUINE), null, domain);
  }
});

test('no unrelated domain is flagged', () => {
  for (const domain of fixture.unrelated) {
    assert.equal(findLookalike(domain, GENUINE), null, domain);
  }
});

test('no sender or link in the benign set is flagged', () => {
  const domains = new Set<string>();
  for (const item of benign.items) {
    if (item.from) {
      domains.add(item.from.address.split('@')[1] ?? '');
    }
    for (const link of item.links ?? []) {
      domains.add(new URL(link.href).hostname);
    }
  }
  assert.ok(domains.size >= 3);
  for (const domain of domains) {
    assert.equal(findLookalike(domain, GENUINE), null, domain);
  }
});

test('case, a trailing dot and surrounding space do not hide a lookalike or flag a genuine domain', () => {
  assert.equal(findLookalike('  Tessaline-Packaging.Example. ', GENUINE), null);
  assert.ok(findLookalike('TESSALINE-PACKAGINGS.EXAMPLE', GENUINE));
});

test('short names are not flagged for being one letter apart', () => {
  // Two ordinary short domains that happen to be close. Too little to go on.
  assert.equal(findLookalike('abcd.example', ['abce.example']), null);
});

test('with nothing known, nothing is flagged', () => {
  assert.equal(findLookalike('tessaline-packagings.example', []), null);
  assert.equal(findLookalike('', GENUINE), null);
});

test('tells a subdomain from a different domain that only ends the same way', () => {
  assert.equal(isSameOrSubdomain('portal.tessaline-packaging.example', 'tessaline-packaging.example'), true);
  assert.equal(isSameOrSubdomain('tessaline-packaging.example', 'tessaline-packaging.example'), true);
  assert.equal(isSameOrSubdomain('nottessaline-packaging.example', 'tessaline-packaging.example'), false);
  assert.equal(isSameOrSubdomain('tessaline-packaging.example.invalid', 'tessaline-packaging.example'), false);
});

// The encoded form of a name with letters from another alphabet. Checked
// against Node's own decoder, not against our reading of the specification.
for (const unicode of ['tessаline-packaging.example', 'bücher.example', 'αβγ.test', 'plain.example']) {
  test(`decodes the encoded form of "${unicode}" the way Node does`, () => {
    const encoded = domainToASCII(unicode);

    assert.equal(toUnicodeDomain(encoded), domainToUnicode(encoded));
  });
}

test('a label that is not valid encoded text is left as it is', () => {
  assert.equal(toUnicodeDomain('xn--!!!.example'), 'xn--!!!.example');
});
