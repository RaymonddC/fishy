// The "Live captions" card: shows what the meeting page's content script has
// read, and says plainly when nothing is being read so the paste box can be
// used instead. Lines are kept in memory only.

import type { CaptionLine } from '../core/captions/buffer.ts';
import { CAPTIONS_SYNC, isCaptionsUpdate } from '../core/captions/messages.ts';
import type { CaptionsSyncRequest, CaptionsUpdateMessage } from '../core/captions/messages.ts';

const QUIET_HINT_MS = 60_000;
/** A meeting tab that has sent nothing for this long no longer owns the card. */
const TAB_LOST_MS = 15_000;
const LINES_SHOWN = 12;

export interface CaptionsPanelElements {
  status: HTMLElement;
  list: HTMLElement;
  check: HTMLButtonElement;
}

function statusText(message: CaptionsUpdateMessage, count: number): string {
  const quiet = message.quietForMs >= QUIET_HINT_MS;
  if (message.status === 'waiting') {
    return quiet
      ? 'No captions seen for a minute. Turn them on in the meeting, or paste the text below'
      : 'Captions are off. Turn them on in the meeting (press C)';
  }
  if (count > 0) {
    return 'Reading captions from the meeting';
  }
  return quiet
    ? 'Captions are on but nothing has been read for a minute. If people are speaking, paste the text below'
    : 'Captions are on. Waiting for someone to speak';
}

export function startCaptionsPanel(ui: CaptionsPanelElements, onCheck: (lines: CaptionLine[]) => void): void {
  const byId = new Map<string, CaptionLine>();
  let sourceTab: number | undefined;
  let lastHeardAt = 0;

  const ordered = (): CaptionLine[] =>
    [...byId.values()].sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));

  function render(message: CaptionsUpdateMessage): void {
    const lines = ordered();
    ui.status.textContent = statusText(message, lines.length);
    ui.list.replaceChildren(
      ...lines.slice(-LINES_SHOWN).map((line) => {
        const item = document.createElement('li');
        const speaker = document.createElement('span');
        speaker.className = 'caption-speaker';
        speaker.textContent = line.speaker;
        const text = document.createElement('span');
        text.className = 'caption-text';
        text.textContent = line.text;
        item.append(speaker, text);
        if (!line.final) {
          item.dataset.live = 'true';
        }
        return item;
      }),
    );
    ui.list.hidden = lines.length === 0;
    ui.check.hidden = lines.length === 0;
  }

  function apply(message: CaptionsUpdateMessage, tabId: number | undefined): void {
    const now = Date.now();
    if (tabId !== sourceTab) {
      // Follow one meeting tab at a time. Another tab takes over only when
      // the current one has gone quiet, for example because it was closed.
      if (sourceTab !== undefined && now - lastHeardAt < TAB_LOST_MS) {
        return;
      }
      byId.clear();
      sourceTab = tabId;
    }
    lastHeardAt = now;
    for (const line of message.lines) {
      byId.set(line.id, line);
    }
    render(message);
  }

  chrome.runtime.onMessage.addListener((message: unknown, sender) => {
    // Only this extension's own content script may feed the card.
    if (sender.id === chrome.runtime.id && isCaptionsUpdate(message)) {
      apply(message, sender.tab?.id);
    }
    return false;
  });

  ui.check.addEventListener('click', () => onCheck(ordered()));

  // The panel may open in the middle of a meeting: ask the page for everything so far.
  void (async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id === undefined) {
        return;
      }
      const request: CaptionsSyncRequest = { type: CAPTIONS_SYNC };
      const reply: unknown = await chrome.tabs.sendMessage(tab.id, request);
      if (isCaptionsUpdate(reply)) {
        apply(reply, tab.id);
      }
    } catch {
      // The active tab is not a meeting, or it was opened before the extension was loaded.
    }
  })();
}
