// Test doubles for the phone check: a store kept in memory and a call
// provider that only records what it was asked to do. No network, no phone.

import twilio from 'twilio';

import type { CallProvider, CallRequest } from '../src/call/ports.ts';
import type { CheckConfig, CheckDeps } from '../src/call/ports.ts';
import { hashPin } from '../src/call/pin.ts';
import type { Person, Store, Verification } from '../src/call/ports.ts';

export const TEST_AUTH_TOKEN = 'test-auth-token';
export const BASE_URL = 'https://fishy-demo.example';
// A number in the range reserved for fiction. Never a real number.
export const BUDI_PHONE = '+12025550143';
export const BUDI_PIN = '4821';
export const NOW = 1_800_000_000_000;

export function budi(): Person {
  return { id: 'budi', name: 'Budi Santoso', role: 'CFO', phone: BUDI_PHONE, pin: hashPin(BUDI_PIN, 'test-salt') };
}

export class MemoryStore implements Store {
  people = new Map<string, Person>([['budi', budi()]]);
  verifications = new Map<string, Verification>();
  callsByDay = new Map<string, number>();

  async getPerson(personId: string): Promise<Person | null> {
    return this.people.get(personId) ?? null;
  }

  async createVerification(verification: Verification): Promise<void> {
    this.verifications.set(verification.id, structuredClone(verification));
  }

  async getVerification(id: string): Promise<Verification | null> {
    const found = this.verifications.get(id);
    return found ? structuredClone(found) : null;
  }

  async updateVerification(
    id: string,
    change: (current: Verification) => Verification | null,
  ): Promise<Verification | null> {
    const current = this.verifications.get(id);
    if (!current) {
      return null;
    }
    const next = change(structuredClone(current));
    if (next) {
      this.verifications.set(id, structuredClone(next));
    }
    return structuredClone(next ?? current);
  }

  async reserveCall(dayKey: string, dailyCap: number): Promise<boolean> {
    const used = this.callsByDay.get(dayKey) ?? 0;
    if (used >= dailyCap) {
      return false;
    }
    this.callsByDay.set(dayKey, used + 1);
    return true;
  }
}

export class RecordingCalls implements CallProvider {
  placed: CallRequest[] = [];
  failWith: Error | null = null;

  async placeCall(request: CallRequest): Promise<void> {
    if (this.failWith) {
      throw this.failWith;
    }
    this.placed.push(request);
  }
}

export function config(overrides: Partial<CheckConfig> = {}): CheckConfig {
  return {
    callsEnabled: false,
    callAllowlist: [],
    dailyCallCap: 20,
    approvalPageEnabled: false,
    publicBaseUrl: BASE_URL,
    approvalTtlMs: 15 * 60 * 1000,
    ...overrides,
  };
}

export interface Harness {
  deps: CheckDeps;
  store: MemoryStore;
  calls: RecordingCalls;
  clock: { now: number };
}

export function harness(overrides: Partial<CheckConfig> = {}): Harness {
  const store = new MemoryStore();
  const calls = new RecordingCalls();
  const clock = { now: NOW };
  let nextId = 0;
  const deps: CheckDeps = {
    store,
    calls,
    config: config(overrides),
    now: () => clock.now,
    newId: () => `v${(nextId += 1)}`,
    newToken: () => `token-${nextId}`,
    validSignature: (signature, url, params) =>
      twilio.validateRequest(TEST_AUTH_TOKEN, signature ?? '', url, params),
  };
  return { deps, store, calls, clock };
}

/** Signs a webhook the way the phone provider does, with its own library. */
export function sign(url: string, params: Record<string, string>): string {
  return twilio.getExpectedTwilioSignature(TEST_AUTH_TOKEN, url, params);
}

/** A verification that is waiting for an answer, as `startVerification` leaves it. */
export async function waiting(h: Harness, overrides: Partial<Verification> = {}): Promise<Verification> {
  const verification: Verification = {
    id: 'v-test',
    requestId: 'req-1',
    personId: 'budi',
    requesterUid: 'user-1',
    status: 'waiting',
    choice: null,
    pinVerified: false,
    pinAttempts: 0,
    callPlaced: true,
    callSkippedReason: null,
    approvalTokenHash: null,
    approvalExpiresAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
  await h.store.createVerification(verification);
  return verification;
}
