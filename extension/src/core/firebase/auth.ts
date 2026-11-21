// Anonymous sign-in. The demo has one fictional company and no accounts, but
// Firestore and Cloud Functions still need to know each installation apart.
//
// The import path is the extension build of Firebase Authentication, which
// leaves out the sign-in methods that load code from another site.

import { getAuth, signInAnonymously } from 'firebase/auth/web-extension';

import { getFirebaseApp } from './app.ts';

/** Signs in if needed and returns the anonymous user's ID. */
export async function signIn(): Promise<string> {
  const credential = await signInAnonymously(getAuth(getFirebaseApp()));
  return credential.user.uid;
}
