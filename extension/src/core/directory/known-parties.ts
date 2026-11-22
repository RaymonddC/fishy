// Loads what the company knows about itself and its suppliers, so senders,
// links and invoices can be checked on the laptop.
//
// It comes from Firestore once and is kept in memory for the life of the side
// panel. If it cannot be read, nothing is guessed: the panel says the sender
// or the invoice could not be compared.

import { collection, doc, getDoc, getDocs, getFirestore } from 'firebase/firestore';

import type { SupplierRecord } from '../checks/invoice.ts';
import type { KnownParties } from '../checks/sender.ts';
import { getFirebaseApp } from '../firebase/app.ts';

interface CompanyData {
  known: KnownParties;
  suppliers: SupplierRecord[];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toSupplier(data: Record<string, unknown>): SupplierRecord {
  const bank = isRecord(data.bank) ? data.bank : {};
  const history = Array.isArray(data.invoiceHistory) ? data.invoiceHistory.filter(isRecord) : [];
  return {
    name: text(data.name),
    domain: text(data.domain),
    contactName: text(data.contactName),
    bank: { bankName: text(bank.bankName), accountName: text(bank.accountName), accountNumber: text(bank.accountNumber) },
    invoiceHistory: history.map((entry) => ({
      invoiceNumber: text(entry.invoiceNumber),
      date: text(entry.date),
      amount: typeof entry.amount === 'number' ? entry.amount : 0,
      currency: text(entry.currency),
      bankName: text(entry.bankName),
      accountNumber: text(entry.accountNumber),
    })),
  };
}

async function load(): Promise<CompanyData | null> {
  const db = getFirestore(getFirebaseApp());
  const [profile, supplierDocs] = await Promise.all([
    getDoc(doc(db, 'company', 'profile')),
    getDocs(collection(db, 'suppliers')),
  ]);
  const company = profile.data();
  const companyDomain = text(company?.domain);
  if (companyDomain === '') {
    return null;
  }
  const staffNames = Array.isArray(company?.staffNames)
    ? company.staffNames.filter((name): name is string => typeof name === 'string')
    : [];
  const suppliers = supplierDocs.docs.map((entry) => toSupplier(entry.data())).filter((supplier) => supplier.domain !== '');
  return {
    known: {
      companyName: text(company?.name),
      companyDomain,
      staffNames,
      suppliers: suppliers.map(({ name, domain, contactName }) => ({ name, domain, contactName })),
    },
    suppliers,
  };
}

let loading: Promise<CompanyData | null> | undefined;

function companyData(): Promise<CompanyData | null> {
  loading ??= load().catch(() => {
    // Try again next time: sign-in may not have finished yet.
    loading = undefined;
    return null;
  });
  return loading;
}

/** Null when the company profile has not been loaded into Firestore or cannot be read. */
export async function knownParties(): Promise<KnownParties | null> {
  return (await companyData())?.known ?? null;
}

/** The suppliers with their bank details and past invoices. Null when they cannot be read. */
export async function supplierRecords(): Promise<SupplierRecord[] | null> {
  return (await companyData())?.suppliers ?? null;
}
