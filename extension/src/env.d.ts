/// <reference types="vite/client" />

// Values read from `.env.local` at build time. See `.env.example`.
interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_APPCHECK_DEBUG_TOKEN?: string;
  readonly VITE_CLOUD_MODEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
