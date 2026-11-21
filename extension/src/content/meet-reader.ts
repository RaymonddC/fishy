// Reads live captions from the meeting page.
//
// It only reads the page. It never changes it, never turns captions on, and
// has no way to reach the network: lines are handed to the caller, which
// passes them to the side panel by extension messaging.

import { createCaptionBuffer } from '../core/captions/buffer.ts';
import type { BlockSnapshot, CaptionLine } from '../core/captions/buffer.ts';
import type { CaptionStatus } from '../core/captions/messages.ts';
import { MEET_SELECTORS } from './meet-selectors.ts';

function tidy(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

/** The captions region, or null when captions are off. */
export function findCaptionsRegion(root: ParentNode): Element | null {
  for (const selector of MEET_SELECTORS.regions) {
    const region = root.querySelector(selector);
    if (region) {
      return region;
    }
  }
  return null;
}

function elementChildrenWithText(element: Element): Element[] {
  return Array.from(element.children).filter((child) => tidy(child.textContent) !== '');
}

/** The caption blocks inside the region: by class name, or failing that by shape. */
function blocksIn(region: Element): Element[] {
  const known = Array.from(region.querySelectorAll(MEET_SELECTORS.block));
  if (known.length > 0) {
    return known;
  }
  // Step through wrappers that hold a single child, then take each child as a block.
  let container = region;
  while (container.children.length === 1 && container.firstElementChild?.children.length) {
    container = container.firstElementChild;
  }
  return elementChildrenWithText(container);
}

function readBlock(block: Element): { speaker: string; text: string } {
  const speaker = block.querySelector(MEET_SELECTORS.speaker);
  const text = block.querySelector(MEET_SELECTORS.text);
  if (speaker && text) {
    return { speaker: tidy(speaker.textContent), text: tidy(text.textContent) };
  }
  // By shape: the first part with text is the name, the rest is what was said.
  const parts = elementChildrenWithText(block);
  const [first, ...rest] = parts;
  if (first && rest.length > 0) {
    return { speaker: tidy(first.textContent), text: tidy(rest.map((part) => part.textContent).join(' ')) };
  }
  return { speaker: '', text: tidy(block.textContent) };
}

/** Returns a reader that gives the same block element the same key every time. */
export function createBlockReader(): (region: Element) => BlockSnapshot[] {
  const keys = new WeakMap<Element, string>();
  let count = 0;
  return (region) =>
    blocksIn(region).map((block) => {
      let key = keys.get(block);
      if (!key) {
        count += 1;
        key = `b${count}`;
        keys.set(block, key);
      }
      return { key, ...readBlock(block) };
    });
}

export interface CaptionsSnapshot {
  status: CaptionStatus;
  lines: CaptionLine[];
}

export interface WatcherDeps {
  document: Document;
  MutationObserver: typeof MutationObserver;
  now(): number;
  /** Called with the lines that changed, and whenever the status changes. */
  onUpdate(update: CaptionsSnapshot): void;
}

export interface CaptionWatcher {
  /** Looks for the captions region again. The page can replace it at any time. */
  rescan(): void;
  /** Makes quiet lines final. */
  tick(): void;
  /** The status and every line so far. */
  snapshot(): CaptionsSnapshot;
  stop(): void;
}

export function startCaptionWatcher(deps: WatcherDeps): CaptionWatcher {
  const buffer = createCaptionBuffer();
  const read = createBlockReader();
  let region: Element | null = null;
  let observer: MutationObserver | null = null;
  let status: CaptionStatus | undefined;

  const currentStatus = (): CaptionStatus => (region ? 'live' : 'waiting');

  function scan(): void {
    const changed = buffer.update(region ? read(region) : [], deps.now());
    const next = currentStatus();
    if (changed.length > 0 || next !== status) {
      status = next;
      deps.onUpdate({ status, lines: changed });
    }
  }

  function rescan(): void {
    const found = findCaptionsRegion(deps.document);
    if (found !== region) {
      observer?.disconnect();
      observer = null;
      region = found;
      if (region) {
        observer = new deps.MutationObserver(scan);
        observer.observe(region, { childList: true, subtree: true, characterData: true });
      }
    }
    scan();
  }

  rescan();

  return {
    rescan,
    tick() {
      const changed = buffer.tick(deps.now());
      if (changed.length > 0) {
        deps.onUpdate({ status: currentStatus(), lines: changed });
      }
    },
    snapshot() {
      return { status: currentStatus(), lines: buffer.lines() };
    },
    stop() {
      observer?.disconnect();
      observer = null;
    },
  };
}
