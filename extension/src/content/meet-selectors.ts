// Where captions live on the meeting page.
//
// The page is not ours and its markup changes every few months. Everything
// that depends on that markup is in this one file. These values were taken on
// 21 November 2026 from the selectors that maintained open-source caption
// readers use; they have not yet been confirmed against a live meeting.
//
// If captions stop being read: open the meeting, turn captions on, inspect the
// captions area, and update the values below. The reader also has a fallback
// that reads blocks by their shape when the class names no longer match.

export const MEET_SELECTORS = {
  /** Tried in order. The first one that matches is the captions region. */
  regions: ['[role="region"][aria-label*="aption" i]', 'div[jsname="dsyhDe"]', 'div[role="region"][tabindex="0"]'],
  /** One block per speaker turn, inside the region. */
  block: '.nMcdL',
  /** The speaker's name, inside a block. */
  speaker: '.NWpY1d',
  /** The spoken words, inside a block. */
  text: '.ygicle',
} as const;
