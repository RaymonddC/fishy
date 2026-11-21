// R6: "Pressing 2 turns the banner red."
//
// The banner is a plain function of the verification record, so the colour
// for every outcome can be pinned here.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bannerFor } from '../src/core/call/banner.ts';
import type { CheckView } from '../src/core/call/banner.ts';

const BUDI = { name: 'Budi Santoso', maskedPhone: '•••••••••43' };

const check = (overrides: Partial<CheckView>): CheckView => ({
  status: 'waiting',
  pinVerified: false,
  callPlaced: true,
  callSkippedReason: null,
  ...overrides,
});

test('pressing 2 turns the banner red and says not to pay', () => {
  const banner = bannerFor(check({ status: 'denied' }), BUDI);

  assert.equal(banner.tone, 'red');
  assert.match(banner.title, /do not pay/i);
  assert.match(banner.detail, /Budi Santoso/);
});

test('a denial confirmed with the PIN says so', () => {
  const banner = bannerFor(check({ status: 'denied', pinVerified: true }), BUDI);

  assert.equal(banner.tone, 'red');
  assert.match(banner.detail, /PIN/);
});

test('only 1 with the right PIN turns the banner green', () => {
  assert.equal(bannerFor(check({ status: 'confirmed', pinVerified: true }), BUDI).tone, 'green');
  assert.notEqual(bannerFor(check({ status: 'awaiting_pin' }), BUDI).tone, 'green');
  assert.notEqual(bannerFor(check({ status: 'waiting' }), BUDI).tone, 'green');
});

test('a failed PIN and an unreached person are red, because nothing was confirmed', () => {
  assert.equal(bannerFor(check({ status: 'pin_failed' }), BUDI).tone, 'red');
  assert.equal(bannerFor(check({ status: 'unreached' }), BUDI).tone, 'red');
});

test('while waiting, the banner is amber and names the masked number that is being called', () => {
  const banner = bannerFor(check({ status: 'waiting', callPlaced: true }), BUDI);

  assert.equal(banner.tone, 'amber');
  assert.ok(banner.detail.includes('•••••••••43'));
});

test('when no call was placed, the banner says why in plain words', () => {
  const waiting = bannerFor(check({ status: 'waiting', callPlaced: false, callSkippedReason: 'calls_disabled' }), BUDI);
  assert.match(waiting.detail, /approval page/i);

  const unreached = bannerFor(check({ status: 'unreached', callPlaced: false, callSkippedReason: 'calls_disabled' }), BUDI);
  assert.match(unreached.detail, /switched off/i);
});
