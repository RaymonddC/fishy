// R4: "A changed bank account is flagged."
//
// The invoice is read on the laptop. These tests run the two fixture PDFs
// through the real PDF library, then through the fixed extraction patterns
// and the comparison with the supplier's past invoices.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

import { checkInvoice, extractInvoiceFields, findSupplier, parseAmount } from '../src/core/checks/invoice.ts';
import type { SupplierRecord } from '../src/core/checks/invoice.ts';
import { parsePdfDate, readPdf } from '../src/core/checks/pdf.ts';
import type { PdfLibrary } from '../src/core/checks/pdf.ts';
import { DEFAULT_RULES } from '../src/core/rules/defaults.ts';
import { decide } from '../src/core/rules/engine.ts';

const fixture = (path: string): URL => new URL(`../../fixtures/${path}`, import.meta.url);
const json = <T>(path: string): T => JSON.parse(readFileSync(fixture(path), 'utf8')) as T;
const bytes = (path: string): Uint8Array => new Uint8Array(readFileSync(fixture(path)));

const library = pdfjs as unknown as PdfLibrary;
const company = json<{
  suppliers: {
    id: string;
    name: string;
    domain: string;
    contact: { name: string };
    bank: SupplierRecord['bank'];
    invoiceHistory: SupplierRecord['invoiceHistory'];
  }[];
}>('company.json');
const invoices = json<Record<'genuine' | 'fake', { amount: number; bank: { accountNumber: string }; pdf: { createdAt: string; modifiedAt: string; producer: string } }>>(
  'gmail/invoices.json',
);

const SUPPLIERS: SupplierRecord[] = company.suppliers.map((supplier) => ({
  name: supplier.name,
  domain: supplier.domain,
  contactName: supplier.contact.name,
  bank: supplier.bank,
  invoiceHistory: supplier.invoiceHistory,
}));
const tessaline = SUPPLIERS[0] as SupplierRecord;

async function check(file: string) {
  const pdf = await readPdf(library, bytes(`gmail/${file}`));
  const fields = extractInvoiceFields(pdf.lines);
  return { pdf, fields, result: checkInvoice(fields, pdf, findSupplier(pdf.text, SUPPLIERS)) };
}

const types = (signals: { type: string }[]): string[] => signals.map((signal) => signal.type).sort();

test('reads the text and the file details of the genuine invoice', async () => {
  const { pdf, fields } = await check('invoice-genuine.pdf');

  assert.ok(pdf.lines.includes('Account number: 4410027731'));
  assert.equal(pdf.producer, invoices.genuine.pdf.producer);
  assert.equal(pdf.createdAt, Date.parse(invoices.genuine.pdf.createdAt));
  assert.equal(pdf.modifiedAt, Date.parse(invoices.genuine.pdf.modifiedAt));
  assert.deepEqual(fields, {
    invoiceNumber: 'TP-2026-046',
    total: invoices.genuine.amount,
    bankName: 'First Example Bank',
    accountName: 'Tessaline Packaging',
    accountNumber: '4410027731',
  });
});

test('the genuine invoice raises nothing: its account is the one on all six past invoices', async () => {
  const { result } = await check('invoice-genuine.pdf');

  assert.equal(tessaline.invoiceHistory.length, 6);
  assert.equal(result.supplier?.name, 'Tessaline Packaging');
  assert.deepEqual(result.signals, []);
});

test('the fake invoice is flagged: its bank account differs from all six past invoices', async () => {
  const { fields, result } = await check('invoice-fake.pdf');

  assert.equal(fields.accountNumber, invoices.fake.bank.accountNumber);
  assert.ok(types(result.signals).includes('bank_account_changed'));
  const changed = result.signals.find((signal) => signal.type === 'bank_account_changed');
  assert.match(changed?.detail ?? '', /4416/, 'names the new account by its last digits');
  assert.match(changed?.detail ?? '', /7731/, 'and the account on record');
  assert.match(changed?.detail ?? '', /6/, 'and how many past invoices it was compared with');
});

test('the fake invoice is also far above the usual amount, and was changed after it was created', async () => {
  const { pdf, result } = await check('invoice-fake.pdf');

  assert.deepEqual(types(result.signals), ['bank_account_changed', 'document_edited', 'invoice_amount_unusual']);
  assert.ok((pdf.modifiedAt ?? 0) > (pdf.createdAt ?? 0));
  const edited = result.signals.find((signal) => signal.type === 'document_edited');
  assert.match(edited?.detail ?? '', /Quick PDF Editor/);
});

test('with the fake invoice the verdict is red, and the pattern is the vendor bank change', async () => {
  const { result } = await check('invoice-fake.pdf');

  const decision = decide(result.signals, DEFAULT_RULES);

  assert.equal(decision.verdict, 'red');
  assert.equal(decision.pattern?.id, 'vendor_bank_change');
});

test('a file changed after it was created is a supporting signal, never a verdict by itself', () => {
  const decision = decide([{ type: 'document_edited' }], DEFAULT_RULES);

  assert.equal(decision.verdict, 'green');
  assert.deepEqual(decision.flags.map((flag) => flag.type), ['document_edited'], 'it is still shown as a flag');
});

test('a document that names no known supplier is not judged', () => {
  const lines = ['Unknown Trading Co', 'Account number: 1234567890', 'Total due: Rp 5,000,000'];
  const result = checkInvoice(extractInvoiceFields(lines), { producer: '', creator: '', createdAt: null, modifiedAt: null }, findSupplier(lines.join('\n'), SUPPLIERS));

  assert.equal(result.supplier, null);
  assert.deepEqual(result.signals, []);
  assert.ok(result.notes.some((note) => /supplier/i.test(note)));
});

test('a document with no readable bank account is not flagged for it, and says so', () => {
  const lines = ['Tessaline Packaging', 'INVOICE', 'Total due: Rp 180,000,000'];
  const result = checkInvoice(extractInvoiceFields(lines), { producer: '', creator: '', createdAt: null, modifiedAt: null }, tessaline);

  assert.deepEqual(result.signals, []);
  assert.ok(result.notes.some((note) => /bank account/i.test(note)));
});

for (const [line, expected] of Object.entries({
  'Account number: 4410027731': '4410027731',
  'Account no. 4410-0277-31': '4410027731',
  'Account Number : 4410 027 731': '4410027731',
  'A/C No: 4410027731': '4410027731',
  'No. Rekening: 4410027731': '4410027731',
  'Nomor rekening 4410027731': '4410027731',
})) {
  test(`reads the account from "${line}"`, () => {
    assert.equal(extractInvoiceFields([line]).accountNumber, expected);
  });
}

test('an account written the same way with different spacing is still the account on record', () => {
  const lines = ['Tessaline Packaging', 'Account no. 4410-0277-31'];
  const result = checkInvoice(extractInvoiceFields(lines), { producer: '', creator: '', createdAt: null, modifiedAt: null }, tessaline);

  assert.deepEqual(result.signals, []);
});

test('reads amounts written with commas, with dots, and with cents', () => {
  assert.equal(parseAmount('Rp 2,400,000,000'), 2400000000);
  assert.equal(parseAmount('Rp 186.200.000'), 186200000);
  assert.equal(parseAmount('USD 1,200.50'), 1200.5);
  assert.equal(parseAmount('1.234,56'), 1234.56);
  assert.equal(parseAmount('no number here'), null);
});

test('an amount within the usual range is not flagged, and three times the largest past invoice is', () => {
  const none = { producer: '', creator: '', createdAt: null, modifiedAt: null };
  const usual = checkInvoice({ accountNumber: '4410027731', total: 200_000_000 }, none, tessaline);
  const triple = checkInvoice({ accountNumber: '4410027731', total: 3 * 184_500_000 }, none, tessaline);

  assert.deepEqual(usual.signals, []);
  assert.deepEqual(types(triple.signals), ['invoice_amount_unusual']);
});

test('a file saved again within a minute of being created does not count as edited', () => {
  const created = Date.parse('2026-11-03T02:10:00Z');
  const quick = checkInvoice({ accountNumber: '4410027731' }, { producer: 'A', creator: 'A', createdAt: created, modifiedAt: created + 30_000 }, tessaline);
  const later = checkInvoice({ accountNumber: '4410027731' }, { producer: 'A', creator: 'A', createdAt: created, modifiedAt: created + 3_600_000 }, tessaline);

  assert.deepEqual(quick.signals, []);
  assert.deepEqual(types(later.signals), ['document_edited']);
});

test('reads the date format PDF files use', () => {
  assert.equal(parsePdfDate('D:20261103021000Z'), Date.parse('2026-11-03T02:10:00Z'));
  assert.equal(parsePdfDate("D:20261118084700+07'00'"), Date.parse('2026-11-18T01:47:00Z'));
  assert.equal(parsePdfDate('D:2026'), Date.parse('2026-01-01T00:00:00Z'));
  assert.equal(parsePdfDate('yesterday'), null);
  assert.equal(parsePdfDate(undefined), null);
});

test('a file that is not a PDF is refused with a plain message', async () => {
  await assert.rejects(() => readPdf(library, new TextEncoder().encode('This is not a PDF at all.')), /could not be read as a PDF/);
});

test('a file that is too large is refused before anything tries to read it', async () => {
  let asked = false;
  const never: PdfLibrary = {
    getDocument() {
      asked = true;
      throw new Error('should not be called');
    },
  };

  await assert.rejects(() => readPdf(never, new Uint8Array(21 * 1024 * 1024)), /too large/);
  assert.equal(asked, false);
});

test('reading an invoice makes no network request, and the invoice code has no way to make one', async () => {
  const realFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = (async () => {
    requests += 1;
    throw new Error('no network in this test');
  }) as typeof fetch;
  try {
    await check('invoice-fake.pdf');
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(requests, 0);

  const forbidden = /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource/;
  for (const file of ['invoice.ts', 'pdf.ts']) {
    const source = readFileSync(new URL(`../src/core/checks/${file}`, import.meta.url), 'utf8');
    assert.ok(!forbidden.test(source), `${file} must not use a network API`);
  }
});
