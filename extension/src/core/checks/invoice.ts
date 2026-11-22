// Checks an invoice against what the company already knows about the
// supplier. Fixed patterns only, on the laptop, with no request to anyone.
//
// The strongest sign of a fake supplier invoice is a bank account the
// supplier has never been paid on before. The amount and the file's own
// history are supporting signs.

import type { Signal } from '../rules/engine.ts';
import type { PdfDetails } from './pdf.ts';

export interface SupplierRecord {
  name: string;
  domain: string;
  contactName: string;
  bank: { bankName: string; accountName: string; accountNumber: string };
  invoiceHistory: {
    invoiceNumber: string;
    date: string;
    amount: number;
    currency: string;
    bankName: string;
    accountNumber: string;
  }[];
}

/** What could be read from the document. A field that was not found is left out. */
export interface InvoiceFields {
  invoiceNumber?: string;
  total?: number;
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
}

export interface InvoiceCheck {
  supplier: SupplierRecord | null;
  fields: InvoiceFields;
  signals: Signal[];
  /** Things the reader should know that are not red flags, such as "no bank account could be read". */
  notes: string[];
}

const ACCOUNT_NUMBER =
  /(?:account\s*(?:number|no\.?|#)|a\/c\s*(?:number|no\.?)?|(?:no\.?|nomor)\s*rek(?:ening)?\.?)\s*[:：]?\s*(\d[\d\s-]{4,}\d)/i;
const BANK_NAME = /^(?:bank(?:\s*name)?|nama\s*bank)\s*[:：]\s*(.+)$/i;
const ACCOUNT_NAME = /(?:account\s*name|beneficiary(?:\s*name)?|atas\s*nama|a\/n)\s*[:：]\s*(.+)$/i;
const INVOICE_NUMBER = /invoice\s*(?:number|no\.?|#)\s*[:：]?\s*([A-Z0-9][A-Z0-9/_-]{2,})/i;
const TOTAL = /(?:total\s*due|amount\s*due|grand\s*total|total\s*amount|total)\s*[:：]?\s*(.+)$/i;

// How far above the supplier's largest past invoice counts as unusual.
const UNUSUAL_TIMES = 3;
// A file saved again moments after it was made has not been "edited".
const EDIT_GAP_MS = 60_000;

function digitsOf(value: string): string {
  return value.replace(/\D/g, '');
}

function ending(account: string): string {
  return digitsOf(account).slice(-4);
}

/** The first number in the text, whichever way its thousands and decimals are written. Null if there is none. */
export function parseAmount(text: string): number | null {
  const token = /\d[\d.,]*\d|\d/.exec(text)?.[0];
  if (!token) {
    return null;
  }
  const lastSeparator = Math.max(token.lastIndexOf(','), token.lastIndexOf('.'));
  const separators = token.replace(/\d/g, '');
  const afterLast = lastSeparator < 0 ? '' : token.slice(lastSeparator + 1);
  const mixed = separators.includes(',') && separators.includes('.');
  // The last separator marks cents when one or two digits follow it and it is
  // either the only separator or a different kind from the ones before it.
  const hasCents = afterLast.length >= 1 && afterLast.length <= 2 && (separators.length === 1 || mixed);
  if (hasCents) {
    return Number(`${digitsOf(token.slice(0, lastSeparator))}.${afterLast}`);
  }
  return Number(digitsOf(token));
}

export function extractInvoiceFields(lines: readonly string[]): InvoiceFields {
  const fields: InvoiceFields = {};
  for (const raw of lines) {
    const line = raw.trim();
    const account = ACCOUNT_NUMBER.exec(line)?.[1];
    if (account && fields.accountNumber === undefined) {
      fields.accountNumber = digitsOf(account);
    }
    const bank = BANK_NAME.exec(line)?.[1]?.trim();
    if (bank && fields.bankName === undefined) {
      fields.bankName = bank;
    }
    const holder = ACCOUNT_NAME.exec(line)?.[1]?.trim();
    if (holder && fields.accountName === undefined) {
      fields.accountName = holder;
    }
    const number = INVOICE_NUMBER.exec(line)?.[1];
    if (number && fields.invoiceNumber === undefined) {
      fields.invoiceNumber = number;
    }
    const total = TOTAL.exec(line)?.[1];
    if (total) {
      // Totals sit at the bottom, so a later one replaces an earlier one.
      const amount = parseAmount(total);
      if (amount !== null) {
        fields.total = amount;
      }
    }
  }
  return fields;
}

/** The supplier the document names, if it names one the company knows. */
export function findSupplier(text: string, suppliers: readonly SupplierRecord[]): SupplierRecord | null {
  const lower = text.toLowerCase();
  return suppliers.find((supplier) => supplier.name !== '' && lower.includes(supplier.name.toLowerCase())) ?? null;
}

function span(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 120) {
    return `${minutes} minutes`;
  }
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} hours` : `${Math.round(hours / 24)} days`;
}

export function checkInvoice(fields: InvoiceFields, details: PdfDetails, supplier: SupplierRecord | null): InvoiceCheck {
  const signals: Signal[] = [];
  const notes: string[] = [];
  if (!supplier) {
    notes.push('This document does not name a supplier in the directory, so it was not compared with past invoices.');
    return { supplier: null, fields, signals, notes };
  }
  const history = supplier.invoiceHistory;

  if (fields.accountNumber === undefined) {
    notes.push('No bank account could be read from this document.');
  } else {
    const onRecord = new Set([supplier.bank.accountNumber, ...history.map((entry) => entry.accountNumber)].map(digitsOf));
    if (!onRecord.has(digitsOf(fields.accountNumber))) {
      signals.push({
        type: 'bank_account_changed',
        detail:
          `The account ending ${ending(fields.accountNumber)} is not the one on record for ${supplier.name}. ` +
          `Their last ${history.length} invoices were paid to the account ending ${ending(supplier.bank.accountNumber)}.`,
      });
    }
  }

  if (fields.total !== undefined && history.length > 0) {
    const largest = Math.max(...history.map((entry) => entry.amount));
    if (largest > 0 && fields.total >= UNUSUAL_TIMES * largest) {
      signals.push({
        type: 'invoice_amount_unusual',
        detail: `The amount is about ${Math.round(fields.total / largest)} times ${supplier.name}’s largest past invoice.`,
      });
    }
  }

  if (details.createdAt !== null && details.modifiedAt !== null && details.modifiedAt - details.createdAt >= EDIT_GAP_MS) {
    const program =
      details.producer !== '' && details.producer !== details.creator ? ` with a different program (${details.producer})` : '';
    signals.push({
      type: 'document_edited',
      detail: `The file was changed${program} ${span(details.modifiedAt - details.createdAt)} after it was made.`,
    });
  }

  return { supplier, fields, signals, notes };
}
