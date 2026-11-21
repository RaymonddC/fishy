// The extension's side of the phone check.
//
// It asks the server to check with a person by ID and then watches the
// result. It never holds a phone number: the directory it can read has only
// names, roles and masked numbers.

import { collection, doc, getDocs, getFirestore, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { getFirebaseApp } from '../firebase/app.ts';
import type { CheckStatus, CheckView } from './banner.ts';

export interface DirectoryPerson {
  id: string;
  name: string;
  role: string;
  maskedPhone: string;
}

export interface StartedCheck {
  verificationId: string;
  call: 'placed' | 'not_placed';
  reason: string | null;
  approvalUrl: string | null;
  person: DirectoryPerson;
}

const DEFAULT_REGION = 'asia-southeast1';
const STATUSES: readonly string[] = ['waiting', 'awaiting_pin', 'confirmed', 'denied', 'pin_failed', 'unreached'];

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** The people who can be asked. Names, roles and masked numbers only. */
export async function listPeople(): Promise<DirectoryPerson[]> {
  const snapshot = await getDocs(collection(getFirestore(getFirebaseApp()), 'directory'));
  return snapshot.docs
    .map((entry) => {
      const data = entry.data();
      return { id: entry.id, name: text(data.name), role: text(data.role), maskedPhone: text(data.maskedPhone) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function startPhoneCheck(personId: string): Promise<StartedCheck> {
  const region = import.meta.env.VITE_FUNCTIONS_REGION || DEFAULT_REGION;
  const call = httpsCallable<{ personId: string; requestId: string }, StartedCheck>(
    getFunctions(getFirebaseApp(), region),
    'startVerification',
  );
  // Only a person ID and a request ID are sent. The server refuses anything else.
  const result = await call({ personId, requestId: `req-${crypto.randomUUID()}` });
  return result.data;
}

/** Calls `onChange` whenever the check changes. Returns a function that stops watching. */
export function watchCheck(
  verificationId: string,
  onChange: (check: CheckView) => void,
  onError: (error: Error) => void,
): () => void {
  const ref = doc(getFirestore(getFirebaseApp()), 'verifications', verificationId);
  return onSnapshot(
    ref,
    (snapshot) => {
      const data = snapshot.data();
      if (!data || !STATUSES.includes(text(data.status))) {
        return;
      }
      onChange({
        status: data.status as CheckStatus,
        pinVerified: data.pinVerified === true,
        callPlaced: data.callPlaced === true,
        callSkippedReason: typeof data.callSkippedReason === 'string' ? data.callSkippedReason : null,
      });
    },
    onError,
  );
}
