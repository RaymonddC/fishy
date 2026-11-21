// Loads what the company knows about itself and its suppliers, so senders
// and links can be checked on the laptop.
//
// It comes from Firestore once and is kept in memory for the life of the side
// panel. If it cannot be read, the sender is simply not judged: the panel
// says so instead of guessing.

import { collection, doc, getDoc, getDocs, getFirestore } from 'firebase/firestore';

import type { KnownParties } from '../checks/sender.ts';
import { getFirebaseApp } from '../firebase/app.ts';

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

async function load(): Promise<KnownParties | null> {
  const db = getFirestore(getFirebaseApp());
  const [profile, suppliers] = await Promise.all([getDoc(doc(db, 'company', 'profile')), getDocs(collection(db, 'suppliers'))]);
  const company = profile.data();
  const companyDomain = text(company?.domain);
  if (companyDomain === '') {
    return null;
  }
  const staffNames = Array.isArray(company?.staffNames)
    ? company.staffNames.filter((name): name is string => typeof name === 'string')
    : [];
  return {
    companyName: text(company?.name),
    companyDomain,
    staffNames,
    suppliers: suppliers.docs
      .map((entry) => {
        const data = entry.data();
        return { name: text(data.name), domain: text(data.domain), contactName: text(data.contactName) };
      })
      .filter((supplier) => supplier.domain !== ''),
  };
}

let loading: Promise<KnownParties | null> | undefined;

/** Null when the company profile has not been loaded into Firestore or cannot be read. */
export function knownParties(): Promise<KnownParties | null> {
  loading ??= load().catch(() => {
    // Try again next time: sign-in may not have finished yet.
    loading = undefined;
    return null;
  });
  return loading;
}
