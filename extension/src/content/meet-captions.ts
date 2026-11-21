// Content script for the meeting page. Reads captions and passes them to the
// side panel. Nothing is stored and nothing is sent anywhere else.

import { CAPTIONS_UPDATE, isCaptionsSync } from '../core/captions/messages.ts';
import type { CaptionsUpdateMessage } from '../core/captions/messages.ts';
import { startCaptionWatcher } from './meet-reader.ts';
import type { CaptionsSnapshot } from './meet-reader.ts';

const RESCAN_MS = 2000;
const TICK_MS = 1000;
const HEARTBEAT_MS = 5000;

const startedAt = Date.now();
let lastCaptionAt: number | null = null;
const timers: number[] = [];

function toMessage(update: CaptionsSnapshot): CaptionsUpdateMessage {
  return {
    type: CAPTIONS_UPDATE,
    status: update.status,
    lines: update.lines,
    quietForMs: Date.now() - (lastCaptionAt ?? startedAt),
  };
}

function send(update: CaptionsSnapshot): void {
  if (update.lines.length > 0) {
    lastCaptionAt = Date.now();
  }
  try {
    // The side panel may be closed. That is fine: it asks for everything when it opens.
    chrome.runtime.sendMessage(toMessage(update)).catch(() => undefined);
  } catch {
    // The extension was reloaded or removed, so this copy of the script is orphaned.
    shutDown();
  }
}

const watcher = startCaptionWatcher({
  document,
  MutationObserver,
  now: () => Date.now(),
  onUpdate: send,
});

function shutDown(): void {
  for (const timer of timers) {
    clearInterval(timer);
  }
  watcher.stop();
}

timers.push(
  window.setInterval(() => watcher.rescan(), RESCAN_MS),
  window.setInterval(() => watcher.tick(), TICK_MS),
  window.setInterval(() => send({ status: watcher.snapshot().status, lines: [] }), HEARTBEAT_MS),
);

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (isCaptionsSync(message)) {
    sendResponse(toMessage(watcher.snapshot()));
  }
  return false;
});
