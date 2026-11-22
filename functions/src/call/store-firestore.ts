// Firestore as the store.
//
// Collections:
// - directory/{personId}          name, role, maskedPhone. Signed-in clients may read.
// - directoryPrivate/{personId}   phone, pinSalt, pinHash. Only this server code reads it.
// - verifications/{id}            one phone check. Only the person who asked may read it.
// - callCounters/{yyyy-mm-dd}     how many calls were placed that day.
// - verificationSuspects/{id}     the details of the request a check is about. No client access.
// - knownBad/{type:value}         confirmed bad accounts, domains and numbers. Signed-in clients may read.
// - company/profile, suppliers/*  the company's own domain and its suppliers. Never marked bad.

import { getFirestore } from 'firebase-admin/firestore';

import type { Person, Store, Suspects, Verification } from './ports.ts';

export function firestoreStore(): Store {
  const db = getFirestore();
  const verifications = db.collection('verifications');

  return {
    async getPerson(personId) {
      const [shown, hidden] = await Promise.all([
        db.collection('directory').doc(personId).get(),
        db.collection('directoryPrivate').doc(personId).get(),
      ]);
      const publicData = shown.data();
      const privateData = hidden.data();
      if (!publicData || !privateData) {
        return null;
      }
      const person: Person = {
        id: personId,
        name: String(publicData.name ?? ''),
        role: String(publicData.role ?? ''),
        phone: String(privateData.phone ?? ''),
        pin: { salt: String(privateData.pinSalt ?? ''), hash: String(privateData.pinHash ?? '') },
      };
      return person;
    },

    async createVerification(verification) {
      await verifications.doc(verification.id).create(verification);
    },

    async getVerification(id) {
      const snapshot = await verifications.doc(id).get();
      return (snapshot.data() as Verification | undefined) ?? null;
    },

    async updateVerification(id, change) {
      const ref = verifications.doc(id);
      return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        const current = snapshot.data() as Verification | undefined;
        if (!current) {
          return null;
        }
        const next = change(current);
        if (next) {
          transaction.set(ref, next);
        }
        return next ?? current;
      });
    },

    async reserveCall(dayKey, dailyCap) {
      const ref = db.collection('callCounters').doc(dayKey);
      return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        const used = Number(snapshot.data()?.count ?? 0);
        if (used >= dailyCap) {
          return false;
        }
        transaction.set(ref, { count: used + 1 });
        return true;
      });
    },

    async saveSuspects(verificationId, suspects) {
      await db.collection('verificationSuspects').doc(verificationId).set(suspects);
    },

    async getSuspects(verificationId) {
      const snapshot = await db.collection('verificationSuspects').doc(verificationId).get();
      return (snapshot.data() as Suspects | undefined) ?? null;
    },

    async raiseKnownBad(entries, now) {
      await db.runTransaction(async (transaction) => {
        const refs = entries.map((entry) => db.collection('knownBad').doc(`${entry.type}:${entry.value}`));
        const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
        entries.forEach((entry, index) => {
          const existing = snapshots[index]?.data();
          const ref = refs[index];
          if (!ref) {
            return;
          }
          transaction.set(
            ref,
            {
              type: entry.type,
              value: entry.value,
              seenCount: Number(existing?.seenCount ?? 0) + 1,
              firstSeen: existing?.firstSeen ?? now,
              lastSeen: now,
            },
            { merge: true },
          );
        });
      });
    },

    async protectedValues() {
      const [profile, suppliers] = await Promise.all([
        db.collection('company').doc('profile').get(),
        db.collection('suppliers').get(),
      ]);
      const domains = [String(profile.data()?.domain ?? '')];
      const accounts: string[] = [];
      for (const supplier of suppliers.docs) {
        const data = supplier.data();
        domains.push(String(data.domain ?? ''));
        accounts.push(String(data.bank?.accountNumber ?? ''));
        for (const entry of Array.isArray(data.invoiceHistory) ? data.invoiceHistory : []) {
          accounts.push(String(entry?.accountNumber ?? ''));
        }
      }
      return { domains: domains.filter(Boolean), accounts: accounts.filter(Boolean) };
    },
  };
}
