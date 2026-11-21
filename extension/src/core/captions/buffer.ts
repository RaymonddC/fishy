// Turns a stream of caption snapshots into one line per spoken turn.
//
// A caption block on the page is not a finished sentence. While someone
// speaks its text grows, earlier words get corrected, and a long turn loses
// words at the front. The buffer follows each block by its key and keeps one
// line for it, so a turn is never reported twice.
//
// No DOM, no clock and no timers in here: the caller passes the time in.

export interface CaptionLine {
  id: string;
  speaker: string;
  text: string;
  /** True once the turn is over: a newer block exists, it left the page, or it went quiet. */
  final: boolean;
}

/** One caption block as read from the page. `key` stays the same for the same block. */
export interface BlockSnapshot {
  key: string;
  speaker: string;
  text: string;
}

export interface CaptionBuffer {
  /** Takes the blocks currently on the page, in order. Returns the lines that changed. */
  update(blocks: readonly BlockSnapshot[], now: number): CaptionLine[];
  /** Makes lines final that have not changed for a while. Returns the lines that changed. */
  tick(now: number): CaptionLine[];
  /** Every line so far, oldest first. */
  lines(): CaptionLine[];
}

export const UNKNOWN_SPEAKER = 'Unknown speaker';

const DEFAULT_QUIET_MS = 4000;
// How much of the new text must be found inside the old text before we accept
// that the page trimmed the front of a long turn.
const TRIM_PROBE = 24;
const TRIM_PROBE_MIN = 12;

interface Entry {
  id: string;
  key: string;
  speaker: string;
  /** Words the page has already trimmed from the front of this turn. */
  prefix: string;
  /** The text the block shows now. */
  shown: string;
  final: boolean;
  changedAt: number;
  /** Whether the block was on the page at the last update. */
  present: boolean;
}

function tidy(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function toLine(entry: Entry): CaptionLine {
  return { id: entry.id, speaker: entry.speaker, text: tidy(entry.prefix + entry.shown), final: entry.final };
}

/** The words the page removed from the front, or '' if this is not a front trim. */
function trimmedFromFront(shown: string, next: string): string {
  if (next.length < TRIM_PROBE_MIN) {
    return '';
  }
  const at = shown.indexOf(next.slice(0, TRIM_PROBE));
  return at > 0 ? shown.slice(0, at) : '';
}

function continues(shown: string, next: string): boolean {
  return next === shown || next.startsWith(shown) || shown.startsWith(next);
}

export function createCaptionBuffer(options: { quietMs?: number } = {}): CaptionBuffer {
  const quietMs = options.quietMs ?? DEFAULT_QUIET_MS;
  const entries: Entry[] = [];
  const byKey = new Map<string, Entry>();

  /**
   * The page sometimes rebuilds its caption list: the same words come back in
   * new elements, so under new keys. A block that vanished in this very update
   * and matches the new block is the same turn, not a new one.
   */
  function adopt(block: BlockSnapshot, currentKeys: ReadonlySet<string>): Entry | undefined {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index];
      if (!entry || !entry.present || currentKeys.has(entry.key)) {
        continue;
      }
      if (entry.speaker === block.speaker && continues(entry.shown, block.text)) {
        byKey.delete(entry.key);
        entry.key = block.key;
        byKey.set(entry.key, entry);
        return entry;
      }
    }
    return undefined;
  }

  return {
    update(blocks, now) {
      const cleaned = blocks
        .map((block) => ({ key: block.key, speaker: tidy(block.speaker) || UNKNOWN_SPEAKER, text: tidy(block.text) }))
        .filter((block) => block.text !== '');
      const currentKeys = new Set(cleaned.map((block) => block.key));
      const changed = new Set<Entry>();

      for (const block of cleaned) {
        let entry = byKey.get(block.key) ?? adopt(block, currentKeys);
        if (!entry) {
          entry = {
            id: `c${entries.length + 1}`,
            key: block.key,
            speaker: block.speaker,
            prefix: '',
            shown: block.text,
            final: false,
            changedAt: now,
            present: true,
          };
          entries.push(entry);
          byKey.set(entry.key, entry);
          changed.add(entry);
          continue;
        }
        if (block.speaker !== entry.speaker && block.speaker !== UNKNOWN_SPEAKER) {
          entry.speaker = block.speaker;
          changed.add(entry);
        }
        if (block.text !== entry.shown) {
          entry.prefix += trimmedFromFront(entry.shown, block.text);
          entry.shown = block.text;
          entry.changedAt = now;
          changed.add(entry);
        }
      }

      const lastKey = cleaned.at(-1)?.key;
      for (const entry of entries) {
        entry.present = currentKeys.has(entry.key);
        if (!entry.final && (!entry.present || entry.key !== lastKey)) {
          entry.final = true;
          changed.add(entry);
        }
      }

      return entries.filter((entry) => changed.has(entry)).map(toLine);
    },

    tick(now) {
      const changed: CaptionLine[] = [];
      for (const entry of entries) {
        if (!entry.final && now - entry.changedAt >= quietMs) {
          entry.final = true;
          changed.push(toLine(entry));
        }
      }
      return changed;
    },

    lines() {
      return entries.map(toLine);
    },
  };
}
