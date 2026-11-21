// R1: "No message text leaves the laptop."
// R7: "Works on a PC without Nano."
//
// The router decides where a message is read. These tests pin the one rule
// that matters: raw text may only reach the on-device model, and the cloud
// model may only ever see redacted text.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import type { DeviceStatus } from '../src/core/ai/device.ts';
import { analyse, LeakGuardError } from '../src/core/ai/router.ts';
import type { InferenceSource, RouterDeps, TextModel } from '../src/core/ai/router.ts';
import { redact } from '../src/core/redact/redact.ts';

// Synthetic message. Names, numbers and domains are invented; the phone
// number is in a range reserved for fiction.
const MESSAGE =
  'This is Budi Prakoso. Transfer Rp 2.400.000.000 to account 1234567890 today. ' +
  'Keep this confidential and do not tell anyone. ' +
  'Reply to budi@example-freight.example or call +1 202 555 0143. ' +
  'Details: https://pay.example-freight.example/inv/8841';

const KNOWN_NAMES = ['Budi Prakoso', 'Budi'];

const SECRETS = [
  'Budi',
  'Prakoso',
  '2.400.000.000',
  '1234567890',
  'budi@example-freight.example',
  '202 555 0143',
  'pay.example-freight.example',
  'example-freight',
];

interface Harness {
  deps: RouterDeps;
  onDevicePrompts: string[];
  cloudPrompts: string[];
}

function recordingModel(log: string[], source: InferenceSource | undefined): TextModel {
  return {
    async generate(prompt) {
      log.push(prompt);
      return { text: 'urgency, secrecy', source };
    },
  };
}

function harness(status: DeviceStatus, overrides: Partial<RouterDeps> = {}): Harness {
  const onDevicePrompts: string[] = [];
  const cloudPrompts: string[] = [];
  const deps: RouterDeps = {
    deviceStatus: async () => status,
    onDevice: recordingModel(onDevicePrompts, 'on_device'),
    inCloud: recordingModel(cloudPrompts, 'in_cloud'),
    redact: (text) => redact(text, KNOWN_NAMES),
    buildPrompt: (message) => `Check this message:\n${message}`,
    ...overrides,
  };
  return { deps, onDevicePrompts, cloudPrompts };
}

function assertNoSecrets(text: string): void {
  for (const secret of SECRETS) {
    assert.ok(!text.includes(secret), `"${secret}" must not be sent to the cloud`);
  }
}

test('model ready: the raw message goes to the on-device model and nothing goes to the cloud', async () => {
  const h = harness('available');

  const result = await analyse(MESSAGE, h.deps);

  assert.equal(h.onDevicePrompts.length, 1);
  assert.ok(h.onDevicePrompts[0]?.includes(MESSAGE));
  assert.equal(h.cloudPrompts.length, 0);
  assert.equal(result.source, 'on_device');
  assert.equal(result.redaction, null);
  assert.equal(result.answer, 'urgency, secrecy');
});

for (const status of ['unavailable', 'missing', 'downloadable', 'downloading'] as const) {
  test(`model ${status}: the cloud model gets redacted text only`, async () => {
    const h = harness(status);

    const result = await analyse(MESSAGE, h.deps);

    assert.equal(h.onDevicePrompts.length, 0, 'the on-device model must not be called');
    assert.equal(h.cloudPrompts.length, 1);
    const sent = h.cloudPrompts[0] ?? '';
    assertNoSecrets(sent);
    assert.ok(sent.includes('[NAME_1]'));
    assert.ok(sent.includes('confidential'), 'tactic wording must survive redaction');
    assert.equal(result.source, 'in_cloud');
    assert.equal(result.deviceStatus, status);
    assert.ok(result.redaction);
    assert.equal(result.redaction.text.includes('Budi'), false);
  });
}

test('on-device call fails: fall back to the redacted cloud path, never raw', async () => {
  const h = harness('available', {
    onDevice: {
      async generate() {
        throw new Error('session crashed');
      },
    },
  });

  const result = await analyse(MESSAGE, h.deps);

  assert.equal(h.cloudPrompts.length, 1);
  assertNoSecrets(h.cloudPrompts[0] ?? '');
  assert.equal(result.source, 'in_cloud');
  assert.match(result.onDeviceError ?? '', /session crashed/);
});

test('an on-device call that reports a cloud source raises a leak error', async () => {
  const cloudLog: string[] = [];
  const h = harness('available', { onDevice: recordingModel(cloudLog, 'in_cloud') });

  await assert.rejects(() => analyse(MESSAGE, h.deps), LeakGuardError);
  assert.equal(h.cloudPrompts.length, 0, 'must not quietly retry in the cloud');
});

test('an on-device call that reports no source raises a leak error', async () => {
  const log: string[] = [];
  const h = harness('available', { onDevice: recordingModel(log, undefined) });

  await assert.rejects(() => analyse(MESSAGE, h.deps), LeakGuardError);
});

test('a cloud call that does not report a cloud source is an error', async () => {
  const log: string[] = [];
  const h = harness('unavailable', { inCloud: recordingModel(log, 'on_device') });

  await assert.rejects(() => analyse(MESSAGE, h.deps), /cloud/i);
});

test('the Firebase models never use a mode that falls back on its own', () => {
  const source = readFileSync(new URL('../src/core/ai/firebase-ai.ts', import.meta.url), 'utf8');

  assert.ok(!/prefer_/i.test(source), 'no automatic-fallback mode may be used for message text');
  assert.ok(source.includes('InferenceMode.ONLY_ON_DEVICE'));
  assert.ok(source.includes('InferenceMode.ONLY_IN_CLOUD'));
});
