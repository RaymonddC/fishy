// The web approval page, for judges who cannot receive a trial call.
// It offers the same menu as the phone and writes the same results.
//
// The page is a demo device and is off unless switched on in the settings:
// the link is handed to the person who asked for the check.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import { handleApproval } from '../src/approve/submitApproval.ts';
import { BUDI_PHONE, BUDI_PIN, harness, NOW, waiting } from './helpers.ts';
import type { Harness } from './helpers.ts';

const TOKEN = 'page-token';
const TOKEN_HASH = createHash('sha256').update(TOKEN).digest('hex');

async function pageCheck(h: Harness) {
  return waiting(h, {
    callPlaced: false,
    callSkippedReason: 'calls_disabled',
    approvalTokenHash: TOKEN_HASH,
    approvalExpiresAt: NOW + 15 * 60 * 1000,
  });
}

function send(h: Harness, body: Record<string, unknown>, token: string = TOKEN) {
  return handleApproval(h.deps, { method: 'POST', query: {}, body: { v: 'v-test', t: token, ...body } });
}

async function statusOf(h: Harness) {
  return (await h.store.getVerification('v-test'))?.status;
}

test('choosing 2 on the page marks the request as denied, like the phone does', async () => {
  const h = harness({ approvalPageEnabled: true });
  await pageCheck(h);

  const reply = await send(h, { action: 'choice', digit: '2' });

  assert.equal(reply.status, 200);
  assert.equal(await statusOf(h), 'denied');
  assert.deepEqual(reply.json, { step: 'pin', result: 'denied' });
});

test('choosing 1 and entering the right PIN confirms the request', async () => {
  const h = harness({ approvalPageEnabled: true });
  await pageCheck(h);

  await send(h, { action: 'choice', digit: '1' });
  const reply = await send(h, { action: 'pin', pin: BUDI_PIN });

  assert.equal(await statusOf(h), 'confirmed');
  assert.deepEqual(reply.json, { step: 'done', result: 'confirmed' });
});

test('a wrong PIN on the page never confirms, and three wrong PINs close the check', async () => {
  const h = harness({ approvalPageEnabled: true });
  await pageCheck(h);
  await send(h, { action: 'choice', digit: '1' });

  await send(h, { action: 'pin', pin: '0000' });
  await send(h, { action: 'pin', pin: '1111' });
  const third = await send(h, { action: 'pin', pin: '2222' });

  assert.equal(await statusOf(h), 'pin_failed');
  assert.deepEqual(third.json, { step: 'done', result: 'pin_failed' });
});

test('a wrong link token is refused and changes nothing', async () => {
  const h = harness({ approvalPageEnabled: true });
  await pageCheck(h);

  const reply = await send(h, { action: 'choice', digit: '2' }, 'guessed-token');

  assert.equal(reply.status, 403);
  assert.equal(await statusOf(h), 'waiting');
});

test('an expired link is refused', async () => {
  const h = harness({ approvalPageEnabled: true });
  await pageCheck(h);
  h.clock.now = NOW + 16 * 60 * 1000;

  const reply = await send(h, { action: 'choice', digit: '2' });

  assert.equal(reply.status, 403);
  assert.equal(await statusOf(h), 'waiting');
});

test('with the page switched off, even a valid link is refused', async () => {
  const h = harness({ approvalPageEnabled: false });
  await pageCheck(h);

  const reply = await send(h, { action: 'choice', digit: '2' });

  assert.equal(reply.status, 403);
  assert.equal(await statusOf(h), 'waiting');
});

test('a check that was started without a page link cannot be answered from the page', async () => {
  const h = harness({ approvalPageEnabled: true });
  await waiting(h);

  const reply = await send(h, { action: 'choice', digit: '2' });

  assert.equal(reply.status, 403);
});

test('opening the page shows who is being asked, and nothing private', async () => {
  const h = harness({ approvalPageEnabled: true });
  await pageCheck(h);

  const reply = await send(h, { action: 'open' });

  assert.equal(reply.status, 200);
  assert.deepEqual(reply.json, { step: 'choice', result: null, person: { name: 'Budi Prakoso', role: 'CFO' } });
  const text = JSON.stringify(reply.json);
  assert.ok(!text.includes(BUDI_PHONE));
  assert.ok(!text.includes('salt'));
});

test('a malformed request is refused', async () => {
  const h = harness({ approvalPageEnabled: true });
  await pageCheck(h);

  assert.equal((await send(h, { action: 'choice', digit: '9' })).status, 400);
  assert.equal((await send(h, { action: 'pin', pin: 'abcd' })).status, 400);
  assert.equal((await send(h, { action: 'other' })).status, 400);
  assert.equal(await statusOf(h), 'waiting');
});

test('the link token is only accepted in the body of a POST, never in the address', async () => {
  const h = harness({ approvalPageEnabled: true });
  await pageCheck(h);

  const reply = await handleApproval(h.deps, { method: 'GET', query: { v: 'v-test', t: TOKEN }, body: {} });

  assert.equal(reply.status, 405);
});
