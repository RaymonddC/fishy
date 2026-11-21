// The Firebase app, configured from local environment values.
//
// Nothing here is a secret that belongs in the repository: the values come
// from `.env.local`, which is never committed. See `.env.example`.

import { initializeApp } from 'firebase/app';
import type { FirebaseApp, FirebaseOptions } from 'firebase/app';

const REQUIRED = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID'] as const;

/** Names of the required settings that are empty. Empty list means ready. */
export function missingFirebaseConfig(): string[] {
  const env = import.meta.env;
  return REQUIRED.filter((name) => !env[name]);
}

function readConfig(): FirebaseOptions {
  const env = import.meta.env;
  const config: FirebaseOptions = {};
  if (env.VITE_FIREBASE_API_KEY) config.apiKey = env.VITE_FIREBASE_API_KEY;
  if (env.VITE_FIREBASE_AUTH_DOMAIN) config.authDomain = env.VITE_FIREBASE_AUTH_DOMAIN;
  if (env.VITE_FIREBASE_PROJECT_ID) config.projectId = env.VITE_FIREBASE_PROJECT_ID;
  if (env.VITE_FIREBASE_APP_ID) config.appId = env.VITE_FIREBASE_APP_ID;
  if (env.VITE_FIREBASE_MESSAGING_SENDER_ID) config.messagingSenderId = env.VITE_FIREBASE_MESSAGING_SENDER_ID;
  return config;
}

let app: FirebaseApp | undefined;

export function getFirebaseApp(): FirebaseApp {
  if (app) {
    return app;
  }
  const missing = missingFirebaseConfig();
  if (missing.length > 0) {
    throw new Error(`Firebase is not configured. Missing: ${missing.join(', ')}.`);
  }
  app = initializeApp(readConfig());
  return app;
}
