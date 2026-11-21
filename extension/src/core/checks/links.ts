// Checks where the links in an email really go.
//
// Two checks run on the laptop: does the visible text name a different place
// from the real address, and does the real address imitate a domain the
// company knows. A third check, against a list of unsafe sites, needs a
// request; for that this hands back the addresses with everything after the
// path removed, so nothing private in a link is sent.

import type { Signal } from '../rules/engine.ts';
import { findLookalike, isSameOrSubdomain, normaliseDomain } from './lookalike.ts';
import type { LookalikeFinding } from './lookalike.ts';

export interface LinkInput {
  /** What the reader sees. */
  text: string;
  /** Where the link really goes. */
  href: string;
}

export interface LinkFinding {
  href: string;
  host: string;
  /** The domain named in the visible text, if it names one. */
  shownHost: string | null;
  mismatch: boolean;
  lookalike: LookalikeFinding | null;
}

export interface LinkCheck {
  findings: LinkFinding[];
  signals: Signal[];
  /** Addresses to check against the unsafe-sites list: no query, fragment or sign-in details. */
  toCheck: string[];
}

const MAX_TO_CHECK = 10;
const DOMAIN_IN_TEXT = /(?:https?:\/\/)?((?:[a-z0-9¡-￿-]+\.)+[a-z¡-￿]{2,})(?=[/\s:?#]|$)/i;
// "invoice.pdf" in a link's text is a file name, not a place.
const FILE_NAME = /\.(pdf|docx?|xlsx?|pptx?|csv|zip|html?|png|jpe?g|txt)$/i;

function webAddress(href: string): URL | null {
  try {
    const url = new URL(href);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

/** The address with only its scheme, host, port and path. Null if it is not a web address. */
export function stripQuery(href: string): string | null {
  const url = webAddress(href);
  return url ? `${url.protocol}//${url.host}${url.pathname}` : null;
}

function domainShownIn(text: string): string | null {
  const match = DOMAIN_IN_TEXT.exec(text.trim());
  const found = match?.[1];
  if (!found || FILE_NAME.test(found)) {
    return null;
  }
  return normaliseDomain(found);
}

export function checkLinks(links: readonly LinkInput[], genuine: readonly string[]): LinkCheck {
  const findings: LinkFinding[] = [];
  const toCheck: string[] = [];

  for (const link of links) {
    const url = webAddress(link.href);
    if (!url) {
      continue;
    }
    const host = normaliseDomain(url.hostname);
    const shownHost = domainShownIn(link.text);
    const mismatch =
      shownHost !== null && !isSameOrSubdomain(host, shownHost) && !isSameOrSubdomain(shownHost, host);
    findings.push({ href: link.href, host, shownHost, mismatch, lookalike: findLookalike(host, genuine) });

    const stripped = stripQuery(link.href);
    if (stripped && !toCheck.includes(stripped) && toCheck.length < MAX_TO_CHECK) {
      toCheck.push(stripped);
    }
  }

  const signals: Signal[] = [];
  const misleading = findings.find((finding) => finding.mismatch);
  if (misleading) {
    signals.push({
      type: 'link_text_mismatch',
      detail: `The text shows ${misleading.shownHost ?? ''} but the link goes to ${misleading.host}`,
    });
  }
  const imitation = findings.find((finding) => finding.lookalike);
  if (imitation?.lookalike) {
    signals.push({
      type: 'link_lookalike_domain',
      detail: `${imitation.lookalike.domain} imitates ${imitation.lookalike.target}: ${imitation.lookalike.reason}`,
    });
  }
  return { findings, signals, toCheck };
}
