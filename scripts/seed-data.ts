// Works out what the seed script writes to Firestore. No database in here, so
// it can be tested.
//
// The fixtures hold no phone numbers and no PIN. Both are supplied when the
// script runs, and both go only into `directoryPrivate`, which clients cannot
// read.

import { hashPin } from '../functions/src/call/pin.ts';
import { maskPhone } from '../functions/src/call/startVerification.ts';
import type { BankDetails, Company, HistoryEntry, KnownBad, KnownBadEntry } from './fixture-rules.ts';

export interface SeedInput {
  company: Company;
  knownBad: KnownBad;
  /** Staff ID to the number on record, in international format. */
  phones: Record<string, string>;
  /** One demo PIN for everyone. Four to six digits. */
  pin: string;
  saltFor(staffId: string): string;
}

export interface SeedOutput {
  /** Readable by signed-in clients. */
  directory: Record<string, { name: string; role: string; maskedPhone: string; approverOrder: number | null }>;
  /** Readable by Cloud Functions only. */
  directoryPrivate: Record<string, { phone: string; pinSalt: string; pinHash: string }>;
  /** Readable by signed-in clients. Names and the domain only, for the sender check. */
  companyProfile: { name: string; domain: string; staffNames: string[] };
  suppliers: Record<
    string,
    { name: string; domain: string; contactName: string; bank: BankDetails; invoiceHistory: HistoryEntry[] }
  >;
  knownBadEntries: KnownBadEntry[];
  /** Staff who were left out because no number was given for them. */
  skipped: string[];
}

const INTERNATIONAL = /^\+[1-9]\d{7,14}$/;

export function buildSeed(input: SeedInput): SeedOutput {
  const { company, knownBad, phones, pin, saltFor } = input;
  const staffIds = company.staff.map((person) => person.id);
  for (const id of Object.keys(phones)) {
    if (!staffIds.includes(id)) {
      throw new Error(`"${id}" is not on the staff list in fixtures/company.json.`);
    }
  }

  const output: SeedOutput = {
    directory: {},
    directoryPrivate: {},
    companyProfile: {
      name: company.company.name,
      domain: company.company.domain,
      staffNames: company.staff.map((person) => person.name),
    },
    suppliers: {},
    knownBadEntries: [],
    skipped: [],
  };

  for (const person of company.staff) {
    const given = phones[person.id];
    if (given === undefined) {
      output.skipped.push(person.id);
      continue;
    }
    const phone = given.replace(/[\s().-]/g, '');
    if (!INTERNATIONAL.test(phone)) {
      throw new Error(`The number for "${person.id}" must be in international format, such as +00000000000.`);
    }
    const record = hashPin(pin, saltFor(person.id));
    output.directory[person.id] = {
      name: person.name,
      role: person.role,
      maskedPhone: maskPhone(phone),
      approverOrder: person.approverOrder,
    };
    output.directoryPrivate[person.id] = { phone, pinSalt: record.salt, pinHash: record.hash };
  }

  for (const supplier of company.suppliers) {
    output.suppliers[supplier.id] = {
      name: supplier.name,
      domain: supplier.domain,
      contactName: supplier.contact.name,
      bank: supplier.bank,
      invoiceHistory: supplier.invoiceHistory,
    };
  }
  output.knownBadEntries = knownBad.entries.map((entry) => ({ ...entry }));
  return output;
}
