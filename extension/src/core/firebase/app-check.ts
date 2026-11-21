// App Check for the extension.
//
// The usual web providers load a script from another site, and a Chrome
// extension page may only run code that ships inside the extension. So this
// uses a custom provider, which loads nothing, together with a debug token.
//
// With a debug token set, the SDK exchanges that token itself and never asks
// the provider. The provider below therefore only runs if the debug token is
// missing, and says so.

import { CustomProvider, getToken, initializeAppCheck } from 'firebase/app-check';
import type { AppCheck } from 'firebase/app-check';

import { getFirebaseApp } from './app.ts';

export type AppCheckState = 'debug-token' | 'off';

let appCheck: AppCheck | undefined;

/** Starts App Check once. Returns `off` when no debug token is configured. */
export function startAppCheck(): AppCheckState {
  if (appCheck) {
    return 'debug-token';
  }
  const debugToken = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN;
  if (!debugToken) {
    return 'off';
  }
  (globalThis as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
  appCheck = initializeAppCheck(getFirebaseApp(), {
    provider: new CustomProvider({
      getToken: () => Promise.reject(new Error('No App Check provider is set up beyond the debug token.')),
    }),
    isTokenAutoRefreshEnabled: true,
  });
  return 'debug-token';
}

/** Asks Firebase for an App Check token, to prove the exchange works here. */
export async function checkAppCheck(): Promise<void> {
  if (!appCheck) {
    throw new Error('App Check has not been started.');
  }
  await getToken(appCheck, false);
}
