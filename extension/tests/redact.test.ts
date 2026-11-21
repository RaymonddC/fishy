// R7: the cloud path may only see text after redaction on the laptop.
// This is the first, minimal rule set. Task 9 extends it.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { redact } from '../src/core/redact/redact.ts';

test('replaces email addresses', () => {
  const out = redact('Write to budi@example-freight.example today.');
  assert.equal(out.text, 'Write to [EMAIL_1] today.');
});

test('replaces links and bare domains', () => {
  const out = redact('See https://pay.example-freight.example/inv/8841 or portal.example-freight.example now.');
  assert.equal(out.text, 'See [LINK_1] or [LINK_2] now.');
});

test('replaces money amounts in several notations', () => {
  const out = redact('Send Rp 2.400.000.000 now, then USD 1,200.50, then $25.6M, then 3 billion rupiah.');
  assert.equal(out.text, 'Send [AMOUNT_1] now, then [AMOUNT_2], then [AMOUNT_3], then [AMOUNT_4].');
});

test('replaces phone numbers', () => {
  const out = redact('Call +1 202 555 0143 or 0000 0000 0000.');
  assert.equal(out.text, 'Call [PHONE_1] or [PHONE_2].');
});

test('replaces account numbers, with or without separators', () => {
  const out = redact('Old account 1234567890, new account 9988-7766-55.');
  assert.equal(out.text, 'Old account [ACCOUNT_1], new account [ACCOUNT_2].');
});

test('replaces known names as whole words, whatever the case', () => {
  const out = redact('BUDI PRAKOSO asked. Budi insists. Budiman is someone else.', ['Budi Prakoso', 'Budi']);
  assert.equal(out.text, '[NAME_1] asked. [NAME_2] insists. Budiman is someone else.');
});

test('gives the same value the same placeholder', () => {
  const out = redact('Pay 1234567890. I repeat, 1234567890. Not 5550001111.');
  assert.equal(out.text, 'Pay [ACCOUNT_1]. I repeat, [ACCOUNT_1]. Not [ACCOUNT_2].');
});

test('keeps the pressure wording', () => {
  const text = 'This is urgent and strictly confidential. Do it before the end of the day and tell no one.';
  assert.equal(redact(text).text, text);
});

test('redacting twice changes nothing more', () => {
  const names = ['Budi Prakoso', 'Budi'];
  const once = redact(
    'Budi Prakoso: pay Rp 2.400.000.000 to 1234567890, see https://pay.example-freight.example/x, mail budi@example-freight.example, call +1 202 555 0143.',
    names,
  );
  const twice = redact(once.text, names);
  assert.equal(twice.text, once.text);
});

test('reports how many details were removed, by kind', () => {
  const out = redact('Budi: pay Rp 5.000.000 to 1234567890 and 1234567890.', ['Budi']);
  assert.deepEqual(out.counts, { EMAIL: 0, LINK: 0, AMOUNT: 1, PHONE: 0, ACCOUNT: 1, NAME: 1 });
  assert.equal(out.total, 3);
});

// Names that are not in the directory. Without this, a person's name would
// reach the cloud whenever nobody had listed it first.

test('removes capitalised names in the middle of a sentence', () => {
  const out = redact('Please call Yoga Permana about this. Then ask Yoga again.');
  assert.equal(out.text, 'Please call [NAME_1] about this. Then ask [NAME_2] again.');
});

test('removes a full name at the start of a sentence', () => {
  const out = redact('Budi Prakoso here. Send it now.');
  assert.equal(out.text, '[NAME_1] here. Send it now.');
});

test('removes a name after a greeting or a title', () => {
  const out = redact('Hi Budi, as agreed. Dear Mr Prakoso, see below. From: Example Freight');
  assert.equal(out.text, 'Hi [NAME_1], as agreed. Dear [NAME_2], see below. From: [NAME_3]');
});

test('keeps sentence openers, roles, days, months and acronyms', () => {
  const text =
    'Transfer it on Monday. The CFO and the Finance Director approved in November. URGENT. Keep it between us.';
  assert.equal(redact(text).text, text);
});

test('keeps a role but removes the name beside it', () => {
  const out = redact('Ask the Finance Director Budi Prakoso first.');
  assert.equal(out.text, 'Ask the Finance Director [NAME_1] first.');
});
