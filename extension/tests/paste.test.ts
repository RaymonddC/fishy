// The paste box is the fallback when live captions cannot be read. Pasted
// text must give the same line objects as live captions, so everything after
// this point treats the two alike.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createCaptionBuffer, UNKNOWN_SPEAKER } from '../src/core/captions/buffer.ts';
import { formatTranscript, parsePasted, speakerNames } from '../src/core/captions/paste.ts';

test('reads "Speaker: text" lines', () => {
  const lines = parsePasted('Budi Prakoso: Do it now.\nLaras Pramesti: Which account?');

  assert.deepEqual(lines, [
    { id: 'c1', speaker: 'Budi Prakoso', text: 'Do it now.', final: true },
    { id: 'c2', speaker: 'Laras Pramesti', text: 'Which account?', final: true },
  ]);
});

test('keeps a line without a speaker, under an unknown speaker', () => {
  const lines = parsePasted('Please send the payment today, it is urgent.');

  assert.deepEqual(lines, [
    { id: 'c1', speaker: UNKNOWN_SPEAKER, text: 'Please send the payment today, it is urgent.', final: true },
  ]);
});

test('ignores blank lines and tidies white space', () => {
  const lines = parsePasted('\n\n  Budi Prakoso:   Keep   this quiet.  \n\n\n');

  assert.deepEqual(lines, [{ id: 'c1', speaker: 'Budi Prakoso', text: 'Keep this quiet.', final: true }]);
});

test('does not mistake a link or a time for a speaker', () => {
  const lines = parsePasted('https://pay.example-freight.example/inv/8841\nMeet at 17:30 sharp');

  assert.deepEqual(
    lines.map((line) => line.speaker),
    [UNKNOWN_SPEAKER, UNKNOWN_SPEAKER],
  );
});

test('pasting the transcript of live captions gives the same line objects', () => {
  const buffer = createCaptionBuffer();
  buffer.update([{ key: 'a', speaker: 'Budi Prakoso', text: 'Wire it today.' }], 0);
  buffer.update(
    [
      { key: 'a', speaker: 'Budi Prakoso', text: 'Wire it today.' },
      { key: 'b', speaker: 'Laras Pramesti', text: 'To which account?' },
    ],
    500,
  );
  buffer.tick(10_000);
  const live = buffer.lines();

  assert.deepEqual(parsePasted(formatTranscript(live)), live);
});

test('lists each speaker name and its parts, for redaction', () => {
  const lines = parsePasted('Budi Prakoso: Wire it today.\nLaras: To which account?\nNo speaker on this line');

  assert.deepEqual(speakerNames(lines).sort(), ['Budi', 'Budi Prakoso', 'Laras', 'Prakoso']);
});
