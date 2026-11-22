// Cloud Functions for the phone check. The rules live in ./call and ./approve;
// this file only connects them to Firebase and reads the settings.
//
// Settings are deploy-time values, not interface controls. See functions/.env.example.

import { randomBytes } from 'node:crypto';

import { initializeApp } from 'firebase-admin/app';
import { HttpsError, onCall, onRequest } from 'firebase-functions/https';
import { defineBoolean, defineInt, defineSecret, defineString } from 'firebase-functions/params';
import twilio from 'twilio';

import { handleApproval } from './approve/submitApproval.ts';
import { parseAllowlist } from './call/gate.ts';
import { RequestError } from './call/ports.ts';
import type { CallProvider, CheckConfig, CheckDeps } from './call/ports.ts';
import { startVerification as start } from './call/startVerification.ts';
import { firestoreStore } from './call/store-firestore.ts';
import { twilioCalls } from './call/twilio-calls.ts';
import { handleVoice } from './call/webhooks.ts';
import { reportSuspects as report } from './learn/suspects.ts';
import { checkLink as checkOneLink } from './webrisk/checkLink.ts';
import { webRiskLookup } from './webrisk/web-risk-lookup.ts';

initializeApp();

const REGION = 'asia-southeast1';

const TWILIO_ACCOUNT_SID = defineSecret('TWILIO_ACCOUNT_SID');
const TWILIO_AUTH_TOKEN = defineSecret('TWILIO_AUTH_TOKEN');
const TWILIO_FROM = defineString('TWILIO_FROM', { default: '' });

// Both locks on real calls are closed unless a deployment opens them.
const CALLS_ENABLED = defineBoolean('CALLS_ENABLED', { default: false });
const CALL_ALLOWLIST = defineString('CALL_ALLOWLIST', { default: '' });
const CALLS_DAILY_CAP = defineInt('CALLS_DAILY_CAP', { default: 20 });

const APPROVAL_PAGE_ENABLED = defineBoolean('APPROVAL_PAGE_ENABLED', { default: false });
const PUBLIC_BASE_URL = defineString('PUBLIC_BASE_URL');

function config(): CheckConfig {
  return {
    callsEnabled: CALLS_ENABLED.value(),
    callAllowlist: parseAllowlist(CALL_ALLOWLIST.value()),
    dailyCallCap: CALLS_DAILY_CAP.value(),
    approvalPageEnabled: APPROVAL_PAGE_ENABLED.value(),
    publicBaseUrl: PUBLIC_BASE_URL.value(),
    approvalTtlMs: 15 * 60 * 1000,
  };
}

const noCalls: CallProvider = {
  async placeCall() {
    throw new Error('This function does not place calls.');
  },
};

function deps(calls: CallProvider, authToken: string | null): CheckDeps {
  return {
    store: firestoreStore(),
    calls,
    config: config(),
    now: () => Date.now(),
    newId: () => randomBytes(15).toString('base64url'),
    newToken: () => randomBytes(32).toString('base64url'),
    validSignature: (signature, url, params) =>
      authToken !== null && twilio.validateRequest(authToken, signature ?? '', url, params),
  };
}

/** Called by the extension. Takes a person ID and a request ID, never a phone number. */
export const startVerification = onCall(
  { region: REGION, enforceAppCheck: true, secrets: [TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN] },
  async (request) => {
    const calls = twilioCalls(TWILIO_ACCOUNT_SID.value(), TWILIO_AUTH_TOKEN.value(), TWILIO_FROM.value());
    try {
      return await start(deps(calls, null), request.auth ? { uid: request.auth.uid } : null, request.data);
    } catch (error) {
      if (error instanceof RequestError) {
        throw new HttpsError(error.code, error.message);
      }
      throw error;
    }
  },
);

/** Called by the phone provider. Reached through Hosting at /voice/**. */
export const voice = onRequest({ region: REGION, secrets: [TWILIO_AUTH_TOKEN] }, async (request, response) => {
  if (request.method !== 'POST') {
    response.status(405).end();
    return;
  }
  const reply = await handleVoice(deps(noCalls, TWILIO_AUTH_TOKEN.value()), {
    path: request.path,
    query: request.query,
    body: request.body,
    signature: request.get('X-Twilio-Signature') ?? undefined,
  });
  if (reply.xml) {
    response.status(reply.status).type('text/xml').send(reply.xml);
  } else {
    response.status(reply.status).end();
  }
});

/** Called by the web approval page. Reached through Hosting at /api/approve. */
export const approve = onRequest({ region: REGION }, async (request, response) => {
  const reply = await handleApproval(deps(noCalls, null), {
    method: request.method,
    query: request.query,
    body: request.body,
  });
  response.set('Cache-Control', 'no-store').status(reply.status).json(reply.json);
});

/**
 * Called by the extension to check one link against a list of suspected
 * unsafe sites. Takes an address and nothing else, and strips it first.
 */
export const checkLink = onCall({ region: REGION, enforceAppCheck: true }, async (request) => {
  try {
    return await checkOneLink(
      { lookup: webRiskLookup(), now: () => Date.now() },
      request.auth ? { uid: request.auth.uid } : null,
      request.data,
    );
  } catch (error) {
    if (error instanceof RequestError) {
      throw new HttpsError(error.code, error.message);
    }
    throw new HttpsError('unavailable', 'The link could not be checked.');
  }
});

/**
 * Called by the extension right after a check starts, with the details of the
 * request it is about: domains, account numbers and phone numbers only. They
 * join the known-bad list only if the real person says "not me" with their PIN.
 */
export const reportSuspects = onCall({ region: REGION, enforceAppCheck: true }, async (request) => {
  try {
    return await report(deps(noCalls, null), request.auth ? { uid: request.auth.uid } : null, request.data);
  } catch (error) {
    if (error instanceof RequestError) {
      throw new HttpsError(error.code, error.message);
    }
    throw error;
  }
});
