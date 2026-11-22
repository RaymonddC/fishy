// Keeps a copy of the known-bad list on the laptop.
//
// The list is fetched whole, never queried for one detail: asking "is this
// account bad?" would tell the server which accounts the company is being
// asked to pay. Matching then happens against the copy, with no request.

import { collection, getDocs, getFirestore } from 'firebase/firestore';

import { getFirebaseApp } from '../firebase/app.ts';
import { createKnownBadIndex } from '../match/known-bad.ts';
import type { KnownBadEntry, KnownBadIndex, KnownBadType } from '../match/known-bad.ts';

const TYPES: readonly string[] = ['account', 'domain', 'number'];

async function load(): Promise<KnownBadIndex> {
  const snapshot = await getDocs(collection(getFirestore(getFirebaseApp()), 'knownBad'));
  const entries: KnownBadEntry[] = [];
  for (const entry of snapshot.docs) {
    const data = entry.data();
    if (TYPES.includes(data.type) && typeof data.value === 'string' && typeof data.seenCount === 'number') {
      entries.push({ type: data.type as KnownBadType, value: data.value, seenCount: data.seenCount });
    }
  }
  return createKnownBadIndex(entries);
}

let loading: Promise<KnownBadIndex | null> | undefined;

/** The copy of the list, fetched once. Null when it cannot be read. */
export function knownBadList(): Promise<KnownBadIndex | null> {
  loading ??= load().catch(() => {
    // Try again next time: sign-in may not have finished yet.
    loading = undefined;
    return null;
  });
  return loading;
}

/** Fetches the list again, for example after a confirmed "not me" has added to it. */
export function refreshKnownBad(): Promise<KnownBadIndex | null> {
  loading = undefined;
  return knownBadList();
}
