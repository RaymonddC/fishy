// Firestore as the store.
//
// Collections:
// - directory/{personId}          name, role, maskedPhone. Signed-in clients may read.
// - directoryPrivate/{personId}   phone, pinSalt, pinHash. Only this server code reads it.
// - verifications/{id}            one phone check. Only the person who asked may read it.
// - callCounters/{yyyy-mm-dd}     how many calls were placed that day.

import { getFirestore } from 'firebase-admin/firestore';

import type { Person, Store, Verification } from './ports.ts';

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
  };
}
