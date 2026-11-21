// The paste box: the fallback when live captions cannot be read.
//
// Pasted text becomes the same line objects that live captions produce, so
// everything downstream treats the two sources alike.

import { UNKNOWN_SPEAKER } from './buffer.ts';
import type { CaptionLine } from './buffer.ts';

// "Name: words". The name is letters, spaces and a few marks, so a link
// ("https://...") or a time ("17:30") is not taken for a speaker.
const SPEAKER_LINE = /^(\p{L}[\p{L}\p{M} .'’-]{0,58}):\s+(\S.*)$/u;

export function parsePasted(text: string): CaptionLine[] {
  const lines: CaptionLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (line === '') {
      continue;
    }
    const match = SPEAKER_LINE.exec(line);
    const speaker = match?.[1]?.trim();
    const words = match?.[2];
    lines.push({
      id: `c${lines.length + 1}`,
      speaker: speaker && words ? speaker : UNKNOWN_SPEAKER,
      text: speaker && words ? words : line,
      final: true,
    });
  }
  return lines;
}

/** One line of text per caption line. The opposite of `parsePasted`. */
export function formatTranscript(lines: readonly CaptionLine[]): string {
  return lines
    .map((line) => (line.speaker === UNKNOWN_SPEAKER ? line.text : `${line.speaker}: ${line.text}`))
    .join('\n');
}

/**
 * The names to remove before a transcript may go to the cloud: each speaker's
 * full name and each part of it, so "Budi" is removed as well as "Budi Santoso".
 */
export function speakerNames(lines: readonly CaptionLine[]): string[] {
  const names = new Set<string>();
  for (const line of lines) {
    if (line.speaker === UNKNOWN_SPEAKER) {
      continue;
    }
    names.add(line.speaker);
    for (const part of line.speaker.split(/\s+/)) {
      if (part.length >= 3) {
        names.add(part);
      }
    }
  }
  return [...names];
}
