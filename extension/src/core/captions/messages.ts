// Messages between the meeting page's content script and the side panel.
// Captions travel only this way, inside the extension.

import type { CaptionLine } from './buffer.ts';

/** `waiting`: no captions region on the page, so captions are off. */
export type CaptionStatus = 'waiting' | 'live';

/** Content script to side panel: lines that changed, or a status heartbeat with no lines. */
export const CAPTIONS_UPDATE = 'fishy/captions-update';
/** Side panel to content script: send everything so far. */
export const CAPTIONS_SYNC = 'fishy/captions-sync';

export interface CaptionsUpdateMessage {
  type: typeof CAPTIONS_UPDATE;
  status: CaptionStatus;
  lines: CaptionLine[];
  /** Time since the last caption was seen, or since the page loaded if none yet. */
  quietForMs: number;
}

export interface CaptionsSyncRequest {
  type: typeof CAPTIONS_SYNC;
}

function hasType(value: unknown, type: string): boolean {
  return typeof value === 'object' && value !== null && (value as { type?: unknown }).type === type;
}

export function isCaptionsSync(value: unknown): value is CaptionsSyncRequest {
  return hasType(value, CAPTIONS_SYNC);
}

export function isCaptionsUpdate(value: unknown): value is CaptionsUpdateMessage {
  if (!hasType(value, CAPTIONS_UPDATE)) {
    return false;
  }
  const message = value as Partial<CaptionsUpdateMessage>;
  return (
    (message.status === 'waiting' || message.status === 'live') &&
    Array.isArray(message.lines) &&
    typeof message.quietForMs === 'number' &&
    message.lines.every(
      (line) =>
        typeof line === 'object' &&
        line !== null &&
        typeof line.id === 'string' &&
        typeof line.speaker === 'string' &&
        typeof line.text === 'string' &&
        typeof line.final === 'boolean',
    )
  );
}
