// Asks the server whether a link is on a list of suspected unsafe sites.
//
// The extension holds no key for the list service. It sends one address at a
// time, already stripped of everything after the path, and nothing else.
// Results are not stored: they are shown for the email on screen and dropped.

import { getFunctions, httpsCallable } from 'firebase/functions';

import { getFirebaseApp } from '../firebase/app.ts';

export interface LinkSafety {
  checked: string;
  match: boolean;
  threatTypes: string[];
  expireTime: string | null;
  /** Must be shown wherever a match is shown. */
  advisory: { text: string; url: string } | null;
}

const DEFAULT_REGION = 'asia-southeast1';

export async function checkLinkSafety(url: string): Promise<LinkSafety> {
  const region = import.meta.env.VITE_FUNCTIONS_REGION || DEFAULT_REGION;
  const call = httpsCallable<{ url: string }, LinkSafety>(getFunctions(getFirebaseApp(), region), 'checkLink');
  const result = await call({ url });
  return result.data;
}
