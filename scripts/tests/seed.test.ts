// What the seed script writes to Firestore.
//
// Phone numbers and PINs are supplied when the script runs. They never come
// from a file in the repository, and they only ever go into the collection
// that clients cannot read.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { verifyPin } from '../../functions/src/call/pin.ts';
import { loadFixtures } from '../fixture-rules.ts';
import { buildSeed } from '../seed-data.ts';

const { company, knownBad } = loadFixtures();
// Numbers in the range reserved for fiction.
const PHONES = { budi: '+12025550143', bayu: '+1 202 555 0144' };

function seed() {
  return buildSeed({ company, knownBad, phones: PHONES, pin: '4821', saltFor: (id) => `salt-${id}` });
}

test('the readable directory has names, roles and masked numbers, and nothing private', () => {
  const { directory } = seed();

  assert.deepEqual(directory.budi, { name: 'Budi Prakoso', role: 'CFO', maskedPhone: `${'•'.repeat(9)}43`, approverOrder: 1 });
  const text = JSON.stringify(directory);
  assert.ok(!text.includes('2025550143'));
  assert.ok(!text.includes('salt'));
  assert.ok(!text.includes('4821'));
});

test('the private directory has the number on record and a PIN record, not the PIN', () => {
  const { directoryPrivate } = seed();

  assert.equal(directoryPrivate.budi?.phone, '+12025550143');
  assert.equal(directoryPrivate.bayu?.phone, '+12025550144', 'spaces are removed');
  assert.ok(!JSON.stringify(directoryPrivate).includes('4821'));
  const record = { salt: directoryPrivate.budi?.pinSalt ?? '', hash: directoryPrivate.budi?.pinHash ?? '' };
  assert.equal(verifyPin('4821', record), true);
});

test('only people with a number are added, and the rest are reported', () => {
  const { directory, directoryPrivate, skipped } = seed();

  assert.deepEqual(Object.keys(directoryPrivate).sort(), ['bayu', 'budi']);
  assert.deepEqual(Object.keys(directory).sort(), ['bayu', 'budi']);
  assert.deepEqual(skipped, ['laras']);
});

test('a number that is not in international format stops the seed', () => {
  assert.throws(
    () => buildSeed({ company, knownBad, phones: { budi: '0812' }, pin: '4821', saltFor: () => 's' }),
    /international format/,
  );
});

test('a number for someone who is not on the staff list stops the seed', () => {
  assert.throws(
    () => buildSeed({ company, knownBad, phones: { nobody: '+12025550143' }, pin: '4821', saltFor: () => 's' }),
    /not on the staff list/,
  );
});

test('suppliers carry their invoice history, and the known-bad list is copied as it is', () => {
  const { suppliers, knownBadEntries } = seed();

  assert.equal(suppliers.tessaline?.invoiceHistory.length, 6);
  assert.equal(suppliers.tessaline?.bank.accountNumber, company.suppliers[0]?.bank.accountNumber);
  assert.equal(knownBadEntries.length, knownBad.entries.length);
});
