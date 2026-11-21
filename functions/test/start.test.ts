// Starting a phone check.
//
// "Never calls a number taken from the message": the request carries a person
// ID only. The number comes from the directory on the server, and the caller
// never sees it.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { RequestError } from '../src/call/ports.ts';
import { startVerification } from '../src/call/startVerification.ts';
import { BASE_URL, BUDI_PHONE, harness } from './helpers.ts';

const USER = { uid: 'user-1' };
const REQUEST = { personId: 'budi', requestId: 'req-1' };
const OPEN = { callsEnabled: true, callAllowlist: [BUDI_PHONE] };

async function rejects(run: () => Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(run, (error: unknown) => error instanceof RequestError && error.code === code);
}

test('a caller who is not signed in is refused', async () => {
  const h = harness(OPEN);

  await rejects(() => startVerification(h.deps, null, REQUEST), 'unauthenticated');
  assert.equal(h.calls.placed.length, 0);
});

for (const extra of [
  { phone: '+12025550199' },
  { to: '+12025550199' },
  { number: '+12025550199' },
  { phoneNumber: '+12025550199' },
  { anythingElse: true },
]) {
  test(`a request that carries "${Object.keys(extra)[0]}" is refused and nothing is called`, async () => {
    const h = harness(OPEN);

    await rejects(() => startVerification(h.deps, USER, { ...REQUEST, ...extra }), 'invalid-argument');
    assert.equal(h.calls.placed.length, 0);
    assert.equal(h.store.verifications.size, 0);
  });
}

test('a person ID that looks like a phone number is refused', async () => {
  const h = harness(OPEN);

  await rejects(
    () => startVerification(h.deps, USER, { personId: '+12025550199', requestId: 'req-1' }),
    'invalid-argument',
  );
  await rejects(
    () => startVerification(h.deps, USER, { personId: '02025550199', requestId: 'req-1' }),
    'invalid-argument',
  );
  assert.equal(h.calls.placed.length, 0);
});

test('a request for someone who is not in the directory is refused', async () => {
  const h = harness(OPEN);

  await rejects(() => startVerification(h.deps, USER, { personId: 'nobody', requestId: 'req-1' }), 'not-found');
});

test('with the gate closed no call is placed, and the check is still recorded', async () => {
  const h = harness();

  const result = await startVerification(h.deps, USER, REQUEST);

  assert.equal(h.calls.placed.length, 0);
  assert.equal(result.call, 'not_placed');
  assert.equal(result.reason, 'calls_disabled');
  assert.equal(result.approvalUrl, null, 'no approval link unless the page is switched on');
  const saved = await h.store.getVerification(result.verificationId);
  // No call and no page: nobody can answer, so it must not sit there "waiting".
  assert.equal(saved?.status, 'unreached');
  assert.equal(saved?.requesterUid, 'user-1');
  assert.equal(saved?.callPlaced, false);
});

test('with the gate closed and the approval page on, only the approval link is returned', async () => {
  const h = harness({ approvalPageEnabled: true });

  const result = await startVerification(h.deps, USER, REQUEST);

  assert.equal(h.calls.placed.length, 0);
  assert.ok(result.approvalUrl?.startsWith(`${BASE_URL}/approve/?v=${result.verificationId}#t=`));
  const saved = await h.store.getVerification(result.verificationId);
  assert.equal(saved?.status, 'waiting');
  assert.ok(saved?.approvalTokenHash, 'only a hash of the link token is stored');
  assert.ok(!result.approvalUrl?.includes(saved?.approvalTokenHash ?? 'missing'));
});

test('a number that is not on the allowlist is not called', async () => {
  const h = harness({ callsEnabled: true, callAllowlist: ['+12025550100'] });

  const result = await startVerification(h.deps, USER, REQUEST);

  assert.equal(h.calls.placed.length, 0);
  assert.equal(result.reason, 'not_on_allowlist');
});

test('with the gate open, the number on record is called and the menu asks for 1 or 2', async () => {
  const h = harness(OPEN);

  const result = await startVerification(h.deps, USER, REQUEST);

  assert.equal(result.call, 'placed');
  assert.equal(h.calls.placed.length, 1);
  const call = h.calls.placed[0];
  assert.equal(call?.to, BUDI_PHONE);
  assert.match(call?.twiml ?? '', /Press 1/);
  assert.match(call?.twiml ?? '', /Press 2/);
  assert.ok(call?.twiml.includes(`${BASE_URL}/voice/choice?v=${result.verificationId}`));
  assert.equal(call?.statusCallbackUrl, `${BASE_URL}/voice/status?v=${result.verificationId}`);
});

test('the daily cap stops further calls', async () => {
  const h = harness({ ...OPEN, dailyCallCap: 1 });

  const first = await startVerification(h.deps, USER, REQUEST);
  const second = await startVerification(h.deps, USER, { personId: 'budi', requestId: 'req-2' });

  assert.equal(first.call, 'placed');
  assert.equal(second.call, 'not_placed');
  assert.equal(second.reason, 'daily_cap_reached');
  assert.equal(h.calls.placed.length, 1);
});

test('if the phone provider fails, the check is recorded as not placed', async () => {
  const h = harness({ ...OPEN, approvalPageEnabled: true });
  h.calls.failWith = new Error('provider is down');

  const result = await startVerification(h.deps, USER, REQUEST);

  assert.equal(result.call, 'not_placed');
  assert.equal(result.reason, 'provider_error');
  assert.ok(result.approvalUrl);
  assert.equal((await h.store.getVerification(result.verificationId))?.callPlaced, false);
});

test('the answer never contains the phone number or the PIN record', async () => {
  const h = harness(OPEN);

  const result = await startVerification(h.deps, USER, REQUEST);
  const text = JSON.stringify(result);

  assert.ok(!text.includes(BUDI_PHONE));
  assert.ok(!text.includes('0143'), 'only the last two digits may appear');
  assert.equal(result.person.name, 'Budi Santoso');
  assert.equal(result.person.maskedPhone, `${'•'.repeat(9)}43`);
  assert.ok(!text.includes('salt'));
});
