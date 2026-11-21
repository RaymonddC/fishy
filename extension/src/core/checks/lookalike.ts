// Spots a domain that imitates one you know.
//
// A list of unsafe sites cannot do this: a lookalike registered this morning
// is on no list yet. So this compares the domain with the ones the company
// really deals with, on the laptop, with no request to anyone.
//
// It only ever answers "this resembles that genuine domain". A domain that
// resembles nothing known is simply unknown, not suspicious.

import { toUnicodeDomain } from './punycode.ts';

export interface LookalikeFinding {
  /** The domain that was checked, lower-cased and decoded. */
  domain: string;
  /** The genuine domain it imitates. */
  target: string;
  /** How, in plain words. */
  reason: string;
}

// Below this many characters a name is too short to call a one-letter
// difference an imitation: plenty of honest short names are that close.
const SHORTEST_NAME = 5;
const LONG_NAME = 10;
const EXTRA_WORD_MIN = 8;

// Characters that are easily read as another. Both sides are mapped the same
// way, so "l", "i" and "1" all compare as equal.
const LOOKS_LIKE: Record<string, string> = {
  '0': 'o',
  '1': 'l',
  i: 'l',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '8': 'b',
  // Cyrillic
  'а': 'a',
  'е': 'e',
  'о': 'o',
  'р': 'p',
  'с': 'c',
  'х': 'x',
  'у': 'y',
  'і': 'l',
  'ј': 'j',
  'ѕ': 's',
  'һ': 'h',
  'ԁ': 'd',
  // Greek
  'α': 'a',
  'ο': 'o',
  'ρ': 'p',
  'ν': 'v',
  'ι': 'l',
  'κ': 'k',
  'τ': 't',
  'υ': 'u',
  // Latin letters with a different shape of the same letter
  'ɡ': 'g',
  'ı': 'l',
};

export function normaliseDomain(domain: string): string {
  return toUnicodeDomain(domain.trim().toLowerCase().replace(/\.+$/, ''));
}

/** True for the domain itself and for anything under it, such as portal.example under example. */
export function isSameOrSubdomain(domain: string, parent: string): boolean {
  return domain === parent || domain.endsWith(`.${parent}`);
}

function split(domain: string): { name: string; ending: string } {
  const lastDot = domain.lastIndexOf('.');
  return lastDot < 0 ? { name: domain, ending: '' } : { name: domain.slice(0, lastDot), ending: domain.slice(lastDot + 1) };
}

/** The name with its hyphens and dots taken out. */
function squash(name: string): string {
  return name.replace(/[-.]/g, '');
}

/** The name as it reads at a glance: look-alike characters mapped to one form. */
function skeleton(text: string): string {
  let out = '';
  for (const char of text) {
    out += LOOKS_LIKE[char] ?? char;
  }
  return out.replace(/rn/g, 'm').replace(/vv/g, 'w');
}

/** How many single-letter edits apart two strings are. A swap of neighbours counts as one. */
function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const columns = b.length + 1;
  const table: number[][] = Array.from({ length: rows }, (_row, row) =>
    Array.from({ length: columns }, (_cell, column) => (row === 0 ? column : column === 0 ? row : 0)),
  );
  const at = (row: number, column: number): number => table[row]?.[column] ?? 0;
  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const same = a[row - 1] === b[column - 1];
      let best = Math.min(at(row - 1, column) + 1, at(row, column - 1) + 1, at(row - 1, column - 1) + (same ? 0 : 1));
      if (row > 1 && column > 1 && a[row - 1] === b[column - 2] && a[row - 2] === b[column - 1]) {
        best = Math.min(best, at(row - 2, column - 2) + 1);
      }
      (table[row] as number[])[column] = best;
    }
  }
  return at(a.length, b.length);
}

/** Why `candidate` imitates `target`, or null if it does not. Both are already normalised. */
function compare(candidate: string, target: string): string | null {
  if (candidate.startsWith(`${target}.`) || candidate.includes(`.${target}.`)) {
    return 'the genuine domain is used as the first part of a different domain';
  }
  const mine = split(candidate);
  const theirs = split(target);
  const squashedMine = squash(mine.name);
  const squashedTheirs = squash(theirs.name);
  if (squashedTheirs.length < SHORTEST_NAME) {
    return null;
  }
  if (mine.name === theirs.name) {
    return mine.ending === theirs.ending ? null : 'the same name with a different ending';
  }
  if (squashedMine === squashedTheirs) {
    return 'the same name with a hyphen removed or replaced';
  }
  const glanceMine = skeleton(squashedMine);
  const glanceTheirs = skeleton(squashedTheirs);
  if (glanceMine === glanceTheirs) {
    return 'look-alike characters in place of the real ones';
  }
  if (squashedTheirs.length >= EXTRA_WORD_MIN && squashedMine.includes(squashedTheirs)) {
    return 'the genuine name with an extra word added';
  }
  const allowed = squashedTheirs.length >= LONG_NAME ? 2 : 1;
  if (Math.abs(glanceMine.length - glanceTheirs.length) <= allowed && editDistance(glanceMine, glanceTheirs) <= allowed) {
    return 'one or two letters added, dropped or swapped';
  }
  return null;
}

/**
 * @param genuine The domains the company really deals with: its own and its suppliers'.
 * @returns What the domain imitates, or null. A genuine domain, or anything under one, is never flagged.
 */
export function findLookalike(domain: string, genuine: readonly string[]): LookalikeFinding | null {
  const candidate = normaliseDomain(domain);
  if (!candidate.includes('.')) {
    return null;
  }
  const known = genuine.map(normaliseDomain).filter((entry) => entry.includes('.'));
  if (known.some((entry) => isSameOrSubdomain(candidate, entry))) {
    return null;
  }

  // The whole domain first, then the same with leading labels dropped, so
  // that "portal.lookalike.example" is compared as "lookalike.example" too.
  const labels = candidate.split('.');
  for (let start = 0; start <= labels.length - 2; start += 1) {
    const part = labels.slice(start).join('.');
    for (const target of known) {
      const reason = compare(part, target);
      if (reason) {
        return { domain: candidate, target, reason };
      }
    }
  }
  return null;
}
