// Live captions are rewritten in place while someone speaks, corrected
// afterwards, and trimmed at the front when a turn gets long. The buffer turns
// that stream of snapshots into one line per spoken turn.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createCaptionBuffer, UNKNOWN_SPEAKER } from '../src/core/captions/buffer.ts';
import type { BlockSnapshot } from '../src/core/captions/buffer.ts';

const block = (key: string, speaker: string, text: string): BlockSnapshot => ({ key, speaker, text });

test('a new caption block becomes one line that is not final yet', () => {
  const buffer = createCaptionBuffer();

  const changed = buffer.update([block('a', 'Budi Prakoso', 'I need you')], 0);

  assert.deepEqual(changed, [{ id: 'c1', speaker: 'Budi Prakoso', text: 'I need you', final: false }]);
  assert.deepEqual(buffer.lines(), changed);
});

test('text that grows updates the same line, and an unchanged scan reports nothing', () => {
  const buffer = createCaptionBuffer();
  buffer.update([block('a', 'Budi Prakoso', 'I need you')], 0);

  const changed = buffer.update([block('a', 'Budi Prakoso', 'I need you to wire the money')], 500);
  const again = buffer.update([block('a', 'Budi Prakoso', 'I need you to wire the money')], 900);

  assert.deepEqual(changed, [{ id: 'c1', speaker: 'Budi Prakoso', text: 'I need you to wire the money', final: false }]);
  assert.deepEqual(again, []);
  assert.equal(buffer.lines().length, 1);
});

test('a correction replaces the words, it does not add them again', () => {
  const buffer = createCaptionBuffer();
  buffer.update([block('a', 'Budi Prakoso', 'I need you to wire the money to day')], 0);

  buffer.update([block('a', 'Budi Prakoso', 'I need you to wire the money today.')], 400);

  assert.equal(buffer.lines()[0]?.text, 'I need you to wire the money today.');
});

test('a newer block makes the earlier line final', () => {
  const buffer = createCaptionBuffer();
  buffer.update([block('a', 'Budi Prakoso', 'Do it now.')], 0);

  const changed = buffer.update(
    [block('a', 'Budi Prakoso', 'Do it now.'), block('b', 'Laras Pramesti', 'Understood.')],
    800,
  );

  assert.deepEqual(changed, [
    { id: 'c1', speaker: 'Budi Prakoso', text: 'Do it now.', final: true },
    { id: 'c2', speaker: 'Laras Pramesti', text: 'Understood.', final: false },
  ]);
});

test('a line that stays unchanged for four seconds becomes final', () => {
  const buffer = createCaptionBuffer();
  buffer.update([block('a', 'Budi Prakoso', 'Keep this between us.')], 1000);

  assert.deepEqual(buffer.tick(4999), []);
  assert.deepEqual(buffer.tick(5000), [
    { id: 'c1', speaker: 'Budi Prakoso', text: 'Keep this between us.', final: true },
  ]);
  assert.deepEqual(buffer.tick(9000), [], 'a line is made final once');
});

test('a long turn that is trimmed at the front keeps its beginning', () => {
  const buffer = createCaptionBuffer();
  const first = 'This is urgent and it has to stay confidential until the deal is announced';
  buffer.update([block('a', 'Budi Prakoso', first)], 0);

  // The page drops the first words and keeps adding to the end.
  buffer.update([block('a', 'Budi Prakoso', 'confidential until the deal is announced next week, so tell nobody')], 600);

  assert.equal(
    buffer.lines()[0]?.text,
    'This is urgent and it has to stay confidential until the deal is announced next week, so tell nobody',
  );
});

test('a correction to a line that is already final updates that line and keeps it final', () => {
  const buffer = createCaptionBuffer();
  buffer.update([block('a', 'Budi Prakoso', 'Send it to the knew account')], 0);
  buffer.update([block('a', 'Budi Prakoso', 'Send it to the knew account'), block('b', 'Laras Pramesti', 'OK')], 500);

  const changed = buffer.update(
    [block('a', 'Budi Prakoso', 'Send it to the new account'), block('b', 'Laras Pramesti', 'OK')],
    900,
  );

  assert.deepEqual(changed, [{ id: 'c1', speaker: 'Budi Prakoso', text: 'Send it to the new account', final: true }]);
});

test('a block that leaves the page becomes final and keeps its text', () => {
  const buffer = createCaptionBuffer();
  buffer.update([block('a', 'Budi Prakoso', 'One.'), block('b', 'Laras Pramesti', 'Two')], 0);

  const changed = buffer.update([], 300);

  assert.deepEqual(changed, [{ id: 'c2', speaker: 'Laras Pramesti', text: 'Two', final: true }]);
  assert.deepEqual(
    buffer.lines().map((line) => line.text),
    ['One.', 'Two'],
  );
});

test('the same captions re-read under new keys do not create duplicate lines', () => {
  const buffer = createCaptionBuffer();
  buffer.update([block('a', 'Budi Prakoso', 'Do it now.'), block('b', 'Laras Pramesti', 'Which acc')], 0);

  // The page rebuilt its caption list: same words, new elements.
  buffer.update([block('x', 'Budi Prakoso', 'Do it now.'), block('y', 'Laras Pramesti', 'Which account?')], 400);

  assert.deepEqual(buffer.lines(), [
    { id: 'c1', speaker: 'Budi Prakoso', text: 'Do it now.', final: true },
    { id: 'c2', speaker: 'Laras Pramesti', text: 'Which account?', final: false },
  ]);
});

test('white space is tidied, empty blocks are ignored, and a missing speaker is named as unknown', () => {
  const buffer = createCaptionBuffer();

  buffer.update([block('a', '  ', '  Pay   the\n invoice  '), block('b', 'Laras Pramesti', '   ')], 0);

  assert.deepEqual(buffer.lines(), [{ id: 'c1', speaker: UNKNOWN_SPEAKER, text: 'Pay the invoice', final: false }]);
});

test('lines() hands out copies, so callers cannot change the buffer', () => {
  const buffer = createCaptionBuffer();
  buffer.update([block('a', 'Budi Prakoso', 'Hello')], 0);

  const copy = buffer.lines();
  if (copy[0]) {
    copy[0].text = 'changed';
  }

  assert.equal(buffer.lines()[0]?.text, 'Hello');
});
