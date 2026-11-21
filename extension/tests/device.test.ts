// The router trusts this check, so it must fail closed: anything unexpected
// means "do not send raw text anywhere".

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { readDeviceStatus } from '../src/core/ai/device.ts';

test('reports "missing" when the browser has no on-device model API', async () => {
  assert.equal(await readDeviceStatus({}), 'missing');
});

for (const answer of ['available', 'downloadable', 'downloading', 'unavailable'] as const) {
  test(`passes through "${answer}"`, async () => {
    const scope = { LanguageModel: { availability: async () => answer } };
    assert.equal(await readDeviceStatus(scope), answer);
  });
}

test('treats an unknown answer as unavailable', async () => {
  const scope = { LanguageModel: { availability: async () => 'readily' } };
  assert.equal(await readDeviceStatus(scope), 'unavailable');
});

test('treats a failing check as unavailable', async () => {
  const scope = {
    LanguageModel: {
      availability: async (): Promise<string> => {
        throw new Error('not allowed');
      },
    },
  };
  assert.equal(await readDeviceStatus(scope), 'unavailable');
});

test('asks about English text in and English text out', async () => {
  let asked: unknown;
  const scope = {
    LanguageModel: {
      availability: async (options?: unknown) => {
        asked = options;
        return 'available';
      },
    },
  };

  await readDeviceStatus(scope);

  assert.deepEqual(asked, {
    expectedInputs: [{ type: 'text', languages: ['en'] }],
    expectedOutputs: [{ type: 'text', languages: ['en'] }],
  });
});
