// The demo and test data. Everything in fixtures/ is invented, and these
// checks keep it that way: no real domain, no phone number outside the range
// reserved for fiction, no bank that could be mistaken for a real one.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import { PDFDocument } from 'pdf-lib';

import { fictionalPhone, findDomains, findPhoneNumbers, isReservedDomain, loadFixtures } from '../fixture-rules.ts';
import { buildBenignInvoices, buildBenignMessages, buildInvoicePdf } from '../make-fixtures.ts';

const ROOT = new URL('../../fixtures/', import.meta.url);
const fixtures = loadFixtures();
const { company, invoices, email, lookalikes, knownBad, replay, benignMessages, benignInvoices } = fixtures;

function textFiles(dir: URL): URL[] {
  const found: URL[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const url = new URL(entry.isDirectory() ? `${entry.name}/` : entry.name, dir);
    if (entry.isDirectory()) {
      found.push(...textFiles(url));
    } else if (/\.(json|md|html)$/.test(entry.name)) {
      found.push(url);
    }
  }
  return found;
}

const allText = textFiles(ROOT).map((url) => ({ name: url.pathname.split('/fixtures/')[1] ?? '', text: readFileSync(url, 'utf8') }));
const tessaline = company.suppliers.find((supplier) => supplier.id === 'tessaline');
assert.ok(tessaline, 'the demo supplier must exist');
const staffNames = company.staff.map((person) => person.name);
const genuineDomains = [company.company.domain, ...company.suppliers.map((supplier) => supplier.domain)];

test('there is one fictional company, with staff, suppliers and a directory order', () => {
  assert.equal(typeof company.company.name, 'string');
  assert.ok(company.staff.length >= 3);
  assert.ok(company.suppliers.length >= 2);
  const ids = company.staff.map((person) => person.id);
  assert.equal(new Set(ids).size, ids.length, 'staff IDs are unique');
  for (const person of company.staff) {
    assert.match(person.id, /^[a-z][a-z0-9_-]{0,63}$/, 'a staff ID starts with a letter, so it can never be a phone number');
    assert.ok(person.email.endsWith(`@${company.company.domain}`));
  }
  const approvers = company.staff.filter((person) => person.approverOrder !== null).map((person) => person.approverOrder);
  assert.deepEqual([...approvers].sort(), [1, 2], 'a first approver and a next approver for escalation');
});

test('every domain in every fixture is reserved for examples', () => {
  for (const { name, text } of allText) {
    for (const domain of findDomains(text)) {
      assert.ok(isReservedDomain(domain), `${name} uses "${domain}", which is not a reserved example domain`);
    }
  }
});

test('no fixture contains a phone number, except numbers in the range reserved for fiction', () => {
  for (const { name, text } of allText) {
    for (const number of findPhoneNumbers(text)) {
      assert.ok(fictionalPhone(number), `${name} contains the phone-like number "${number}"`);
    }
  }
});

test('every bank is plainly a made-up one', () => {
  const banks = new Set<string>();
  for (const supplier of company.suppliers) {
    banks.add(supplier.bank.bankName);
    supplier.invoiceHistory.forEach((entry) => banks.add(entry.bankName));
  }
  banks.add(invoices.genuine.bank.bankName);
  banks.add(invoices.fake.bank.bankName);
  for (const bank of banks) {
    assert.match(bank, /Example/, `"${bank}" must have "Example" in its name`);
  }
});

test('only people from the fictional company speak in the meeting fixtures', () => {
  for (const line of replay.lines) {
    assert.ok(staffNames.includes(line.speaker), `"${line.speaker}" is not on the staff list`);
  }
  const dom = allText.find((file) => file.name === 'meet/captions-dom.html')?.text ?? '';
  for (const [, speaker] of dom.matchAll(/class="NWpY1d">([^<]+)</g)) {
    assert.ok(staffNames.includes(speaker ?? ''), `"${speaker}" is not on the staff list`);
  }
});

test('the fake CFO script uses all four pressure tactics, in order of time', () => {
  const said = replay.lines.map((line) => line.text).join(' ').toLowerCase();
  for (const cue of ['i am the cfo', 'today', 'confidential', 'keep this between us', 'new account']) {
    assert.ok(said.includes(cue), `the script should include "${cue}"`);
  }
  const times = replay.lines.map((line) => line.atMs);
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
  const script = allText.find((file) => file.name === 'meet/cfo-script.md')?.text ?? '';
  for (const line of replay.lines) {
    assert.ok(script.includes(line.text), 'every replayed line is in the written script');
  }
});

test('the supplier has six past invoices, all paid to the account on record', () => {
  assert.equal(tessaline.invoiceHistory.length, 6);
  for (const entry of tessaline.invoiceHistory) {
    assert.equal(entry.accountNumber, tessaline.bank.accountNumber);
  }
});

test('the fake invoice names an account that differs from all six; the genuine one matches', () => {
  const history = tessaline.invoiceHistory.map((entry) => entry.accountNumber);
  assert.ok(!history.includes(invoices.fake.bank.accountNumber));
  assert.equal(invoices.fake.supplierId, 'tessaline');
  assert.ok(history.every((account) => account === invoices.genuine.bank.accountNumber));
});

test('the invoice PDFs are reproducible: building them again gives the same bytes', async () => {
  for (const kind of ['genuine', 'fake'] as const) {
    const onDisk = readFileSync(new URL(`gmail/${invoices[kind].pdf.file}`, ROOT));
    const built = Buffer.from(await buildInvoicePdf(invoices[kind], company));
    assert.equal(onDisk.subarray(0, 5).toString(), '%PDF-');
    assert.ok(built.equals(onDisk), `${invoices[kind].pdf.file} is out of date. Run "npm run fixtures".`);
  }
});

test('the fake invoice file shows edit traces and the genuine one does not', async () => {
  const read = async (file: string) =>
    PDFDocument.load(readFileSync(new URL(`gmail/${file}`, ROOT)), { updateMetadata: false });
  const genuine = await read(invoices.genuine.pdf.file);
  const fake = await read(invoices.fake.pdf.file);

  assert.equal(genuine.getModificationDate()?.getTime(), genuine.getCreationDate()?.getTime());
  assert.ok((fake.getModificationDate()?.getTime() ?? 0) > (fake.getCreationDate()?.getTime() ?? 0));
  assert.notEqual(fake.getProducer(), genuine.getProducer());
});

test('the fake email comes from a lookalike of the supplier and links to it', () => {
  const sender = email.from.address.split('@')[1] ?? '';
  const lookalike = lookalikes.lookalikes.find((entry) => entry.domain === sender);
  assert.equal(lookalike?.target, tessaline.domain);
  assert.ok(company.staff.some((person) => person.email === email.to[0]?.address));
  const link = email.links[0];
  assert.ok(link);
  assert.ok(link.text.includes(tessaline.domain), 'the link text shows the genuine domain');
  assert.ok(new URL(link.href).hostname.endsWith(sender), 'the link really goes to the lookalike');
  assert.equal(email.attachments[0]?.fixture, invoices.fake.pdf.file);
  assert.ok(email.bodyText.includes(invoices.fake.bank.accountNumber));
});

test('the lookalike set has at least 30 domains, each aimed at a genuine one', () => {
  assert.ok(lookalikes.lookalikes.length >= 30);
  const domains = lookalikes.lookalikes.map((entry) => entry.domain);
  assert.equal(new Set(domains).size, domains.length, 'no duplicates');
  for (const entry of lookalikes.lookalikes) {
    assert.ok(genuineDomains.includes(entry.target), `${entry.domain} targets an unknown domain`);
    assert.ok(!genuineDomains.includes(entry.domain), `${entry.domain} is a genuine domain`);
    assert.ok(entry.technique.length > 0);
    assert.equal(entry.domain, entry.domain.toLowerCase());
  }
  for (const domain of genuineDomains) {
    assert.ok(lookalikes.genuine.includes(domain), `${domain} should be listed as genuine`);
  }
  assert.ok(lookalikes.unrelated.length >= 3);
});

test('the known-bad list starts with the fake invoice account, seen twice', () => {
  const account = knownBad.entries.find((entry) => entry.value === invoices.fake.bank.accountNumber);
  assert.equal(account?.type, 'account');
  assert.equal(account?.seenCount, 2);
  for (const entry of knownBad.entries) {
    assert.ok(['account', 'domain', 'number'].includes(entry.type));
    assert.ok(Number.isInteger(entry.seenCount) && entry.seenCount >= 1);
    assert.ok(!genuineDomains.includes(entry.value), 'a genuine domain must not be on the list');
  }
  for (const type of ['account', 'domain', 'number']) {
    assert.ok(knownBad.entries.some((entry) => entry.type === type), `at least one known-bad ${type}`);
  }
});

test('the benign set has at least 100 ordinary items and is reproducible', () => {
  assert.ok(benignMessages.items.length + benignInvoices.items.length >= 100);
  const ids = [...benignMessages.items, ...benignInvoices.items].map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length, 'IDs are unique');
  assert.deepEqual(benignMessages.items, buildBenignMessages(company), 'run "npm run fixtures"');
  assert.deepEqual(benignInvoices.items, buildBenignInvoices(company), 'run "npm run fixtures"');
  assert.ok(benignMessages.items.some((item) => item.hard), 'some benign items should be hard ones');
  assert.ok(benignMessages.items.some((item) => item.kind === 'meeting'));
  assert.ok(benignMessages.items.some((item) => item.kind === 'email'));
});

test('nothing in the benign set uses a known-bad detail or a lookalike domain', () => {
  const bad = [...knownBad.entries.map((entry) => entry.value), ...lookalikes.lookalikes.map((entry) => entry.domain)];
  const text = JSON.stringify([benignMessages.items, benignInvoices.items]);
  for (const value of bad) {
    assert.ok(!text.includes(value), `the benign set contains "${value}"`);
  }
  for (const item of benignInvoices.items) {
    const supplier = company.suppliers.find((entry) => entry.id === item.supplierId);
    assert.equal(item.accountNumber, supplier?.bank.accountNumber, 'a benign invoice is paid to the account on record');
  }
});
