// Starts a phone check for a person in the directory.
//
// The request names a person, never a number. The number on record is read
// here on the server, and the caller only ever gets a masked version back.
// This is what makes "never calls a number taken from the message" a rule
// the code enforces and not a promise.

import { createHash } from 'node:crypto';

import { decideCall } from './gate.ts';
import { RECORD_ID, RequestError } from './ports.ts';
import type { CheckDeps, Verification } from './ports.ts';
import { hookUrl, menuTwiml } from './twiml.ts';

export interface StartResult {
  verificationId: string;
  call: 'placed' | 'not_placed';
  /** Why no call was placed, when none was. */
  reason: string | null;
  /** The web approval page for this check, when that page is switched on. */
  approvalUrl: string | null;
  person: { id: string; name: string; role: string; maskedPhone: string };
}

const ALLOWED_FIELDS = ['personId', 'requestId'];
// A person ID starts with a letter, so a phone number can never pass as one.
const PERSON_ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return '•'.repeat(Math.max(0, digits.length - 2)) + digits.slice(-2);
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function readRequest(data: unknown): { personId: string; requestId: string } {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new RequestError('invalid-argument', 'Send personId and requestId.');
  }
  const fields = data as Record<string, unknown>;
  const extra = Object.keys(fields).filter((key) => !ALLOWED_FIELDS.includes(key));
  if (extra.length > 0) {
    throw new RequestError(
      'invalid-argument',
      'Only personId and requestId are accepted. A phone number can never be supplied.',
    );
  }
  const { personId, requestId } = fields;
  if (typeof personId !== 'string' || !PERSON_ID.test(personId)) {
    throw new RequestError('invalid-argument', 'personId must be the ID of a person in the directory.');
  }
  if (typeof requestId !== 'string' || !RECORD_ID.test(requestId)) {
    throw new RequestError('invalid-argument', 'requestId is missing or not valid.');
  }
  return { personId, requestId };
}

export async function startVerification(
  deps: CheckDeps,
  caller: { uid: string } | null,
  data: unknown,
): Promise<StartResult> {
  if (!caller) {
    throw new RequestError('unauthenticated', 'Sign in first.');
  }
  const { personId, requestId } = readRequest(data);
  const person = await deps.store.getPerson(personId);
  if (!person) {
    throw new RequestError('not-found', 'That person is not in the directory.');
  }

  const { config } = deps;
  const now = deps.now();
  const id = deps.newId();

  let approvalUrl: string | null = null;
  let approvalTokenHash: string | null = null;
  if (config.approvalPageEnabled) {
    const token = deps.newToken();
    approvalTokenHash = hashToken(token);
    // The token sits after the "#", so browsers do not send it to any server or log it.
    approvalUrl = `${config.publicBaseUrl.replace(/\/+$/, '')}/approve/?v=${encodeURIComponent(id)}#t=${token}`;
  }

  const decision = decideCall(config, person.phone);
  let reason: string | null = decision.allowed ? null : decision.reason;

  // Save the record before calling: an answer can arrive before placeCall returns.
  const record: Verification = {
    id,
    requestId,
    personId,
    requesterUid: caller.uid,
    status: 'waiting',
    choice: null,
    pinVerified: false,
    pinAttempts: 0,
    callPlaced: false,
    callSkippedReason: reason,
    approvalTokenHash,
    approvalExpiresAt: approvalTokenHash ? now + config.approvalTtlMs : null,
    createdAt: now,
    updatedAt: now,
  };
  await deps.store.createVerification(record);

  let callPlaced = false;
  if (decision.allowed) {
    if (!(await deps.store.reserveCall(dayKey(now), config.dailyCallCap))) {
      reason = 'daily_cap_reached';
    } else {
      try {
        await deps.calls.placeCall({
          to: person.phone,
          twiml: menuTwiml(config.publicBaseUrl, id),
          statusCallbackUrl: hookUrl(config.publicBaseUrl, 'status', id),
        });
        callPlaced = true;
      } catch {
        // The provider's error can contain the number, so it is not passed on.
        reason = 'provider_error';
      }
    }
  }

  // With no call and no approval page nobody can answer, so say so at once.
  const nobodyCanAnswer = !callPlaced && approvalUrl === null;
  await deps.store.updateVerification(id, (current) => ({
    ...current,
    callPlaced,
    callSkippedReason: reason,
    status: nobodyCanAnswer && current.status === 'waiting' ? 'unreached' : current.status,
    updatedAt: deps.now(),
  }));

  return {
    verificationId: id,
    call: callPlaced ? 'placed' : 'not_placed',
    reason,
    approvalUrl,
    person: { id: person.id, name: person.name, role: person.role, maskedPhone: maskPhone(person.phone) },
  };
}
