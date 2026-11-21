// The web approval page's backend.
//
// Trial phone accounts can only call a few verified numbers, so a judge
// cannot receive the call. This page offers the same menu: 1 or 2, then the
// PIN. It goes through the same steps as the phone, so the result is the same.
//
// It is a demo device. The link is handed to the person who asked for the
// check, which would let them answer their own request, so the page is off
// unless it is deliberately switched on. The PIN is still required.

import { timingSafeEqual } from 'node:crypto';

import { isPinFormat } from '../call/pin.ts';
import { RECORD_ID } from '../call/ports.ts';
import type { CheckDeps, Verification } from '../call/ports.ts';
import { hashToken } from '../call/startVerification.ts';
import { answerChoice, answerPin, MAX_PIN_ATTEMPTS } from '../call/steps.ts';

export interface ApprovalRequest {
  method: string;
  query: Record<string, unknown>;
  body: unknown;
}

export interface ApprovalReply {
  status: number;
  json: unknown;
}

type PageStep = 'choice' | 'pin' | 'done';

const REFUSED: ApprovalReply = { status: 403, json: { error: 'This link is not valid.' } };
const MALFORMED: ApprovalReply = { status: 400, json: { error: 'The request is not valid.' } };

/** What the page should show next. */
function view(verification: Verification): { step: PageStep; result: string | null } {
  switch (verification.status) {
    case 'waiting':
      return { step: 'choice', result: null };
    case 'awaiting_pin':
      return { step: 'pin', result: null };
    case 'denied': {
      const pinStillOpen = !verification.pinVerified && verification.pinAttempts < MAX_PIN_ATTEMPTS;
      return { step: pinStillOpen ? 'pin' : 'done', result: 'denied' };
    }
    default:
      return { step: 'done', result: verification.status };
  }
}

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

/** The check this link opens, or null if the link is wrong, expired or switched off. */
async function open(deps: CheckDeps, id: unknown, token: unknown): Promise<Verification | null> {
  if (!deps.config.approvalPageEnabled) {
    return null;
  }
  if (typeof id !== 'string' || !RECORD_ID.test(id) || typeof token !== 'string' || token === '') {
    return null;
  }
  const verification = await deps.store.getVerification(id);
  if (!verification?.approvalTokenHash || verification.approvalExpiresAt === null) {
    return null;
  }
  if (deps.now() > verification.approvalExpiresAt || !sameHash(hashToken(token), verification.approvalTokenHash)) {
    return null;
  }
  return verification;
}

export async function handleApproval(deps: CheckDeps, request: ApprovalRequest): Promise<ApprovalReply> {
  // POST only: the link token travels in the body, so it never ends up in an
  // address, a server log or a browser history.
  if (request.method !== 'POST') {
    return { status: 405, json: { error: 'Use POST.' } };
  }
  if (typeof request.body !== 'object' || request.body === null) {
    return MALFORMED;
  }
  const fields = request.body as Record<string, unknown>;
  const verification = await open(deps, fields.v, fields.t);
  if (!verification) {
    return REFUSED;
  }

  if (fields.action === 'open') {
    const person = await deps.store.getPerson(verification.personId);
    return {
      status: 200,
      json: { ...view(verification), person: { name: person?.name ?? '', role: person?.role ?? '' } },
    };
  }
  if (fields.action === 'choice') {
    if (fields.digit !== '1' && fields.digit !== '2') {
      return MALFORMED;
    }
    const answered = await answerChoice(deps, verification.id, fields.digit);
    return { status: 200, json: view(answered.verification ?? verification) };
  }
  if (fields.action === 'pin') {
    if (typeof fields.pin !== 'string' || !isPinFormat(fields.pin)) {
      return MALFORMED;
    }
    const answered = await answerPin(deps, verification.id, fields.pin);
    return { status: 200, json: view(answered.verification ?? verification) };
  }
  return MALFORMED;
}
