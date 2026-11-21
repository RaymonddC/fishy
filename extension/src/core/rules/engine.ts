// The rules engine: signals in, verdict out.
//
// The verdict is never a model's opinion. Models and checks produce signals
// ("the sender's domain is a lookalike", "the message asks for secrecy"), and
// this function applies fixed patterns to them. The same set of signals gives
// the same verdict, however often and in whatever order it is asked.
//
// A pattern can only require that signals are present. Nothing can require
// that a signal is absent, so learning more can never lower a verdict.
//
// No clock, no randomness and no network in here. A test reads this file to
// keep it that way.

/** Every kind of signal, in the order red flags are shown. */
export const SIGNAL_TYPES = [
  // context: what the message is about
  'money_request',
  // from reading the message
  'tactic_authority',
  'tactic_urgency',
  'tactic_secrecy',
  'payment_details_change',
  // from checking the sender and the links
  'sender_lookalike_domain',
  'sender_name_mismatch',
  'sender_unknown',
  'link_text_mismatch',
  'link_lookalike_domain',
  'link_unsafe',
  // from checking the invoice
  'bank_account_changed',
  'invoice_amount_unusual',
  'document_edited',
  // from the known-bad list
  'known_bad_account',
  'known_bad_domain',
  'known_bad_number',
] as const;

export type SignalType = (typeof SIGNAL_TYPES)[number];

export interface Signal {
  type: SignalType;
  /** A short note for the screen, such as the domain. It never affects the verdict. */
  detail?: string;
}

export type Verdict = 'green' | 'amber' | 'red';

export interface Pattern {
  id: string;
  /** Shown to the user, such as "Vendor bank change". */
  name: string;
  verdict: 'amber' | 'red';
  /** Every one of these signals must be present. */
  all: SignalType[];
  /** And at least `minAny` of these, when given. */
  any?: SignalType[];
  /** Defaults to 1. */
  minAny?: number;
}

export interface RuleSet {
  version: number;
  /** Earlier patterns win over later ones of the same colour. */
  patterns: Pattern[];
}

export interface Flag {
  type: SignalType;
  text: string;
}

export interface Decision {
  verdict: Verdict;
  /** The pattern that decided the verdict, or null when nothing matched. */
  pattern: { id: string; name: string } | null;
  /** Every pattern that matched: red ones first, each colour in rule order. */
  matched: string[];
  /** Every red flag found, once each, in a fixed order. */
  flags: Flag[];
  advice: string;
}

const FLAG_TEXT: Record<Exclude<SignalType, 'money_request'>, string> = {
  tactic_authority: 'Leans on rank or authority to get it done',
  tactic_urgency: 'Pushes for it to be done in a hurry',
  tactic_secrecy: 'Asks to keep it secret or to skip the usual checks',
  payment_details_change: 'Asks to pay a new or different account',
  sender_lookalike_domain: 'The sender’s domain imitates one you know',
  sender_name_mismatch: 'The sender’s name does not match their address',
  sender_unknown: 'The sender is not in the directory',
  link_text_mismatch: 'A link shows one address but goes to another',
  link_lookalike_domain: 'A link goes to a domain that imitates one you know',
  link_unsafe: 'A link may be unsafe: it is on a list of suspected unsafe sites',
  bank_account_changed: 'The bank account differs from this supplier’s past invoices',
  invoice_amount_unusual: 'The amount is far from this supplier’s usual invoices',
  document_edited: 'The document was changed after it was created',
  known_bad_account: 'The bank account was used in a confirmed scam',
  known_bad_domain: 'The domain was used in a confirmed scam',
  known_bad_number: 'The phone number was used in a confirmed scam',
};

/** What a signal means, in plain words. */
export function describeSignal(type: SignalType): string {
  return type === 'money_request' ? 'Asks for a payment or a transfer' : FLAG_TEXT[type];
}

const ADVICE: Record<Verdict, string> = {
  green: 'Nothing fishy found. Still call back on the number on record before paying.',
  amber: 'Something is off. Check with the real person on the number on record before paying.',
  red: 'Do not pay. Check with the real person on the number on record.',
};

function matches(pattern: Pattern, present: ReadonlySet<SignalType>): boolean {
  if (!pattern.all.every((type) => present.has(type))) {
    return false;
  }
  if (!pattern.any || pattern.any.length === 0) {
    return true;
  }
  const found = pattern.any.filter((type) => present.has(type)).length;
  return found >= (pattern.minAny ?? 1);
}

export function decide(signals: readonly Signal[], rules: RuleSet): Decision {
  const present = new Set(signals.map((signal) => signal.type));

  const matched = rules.patterns.filter((pattern) => matches(pattern, present));
  const red = matched.filter((pattern) => pattern.verdict === 'red');
  const amber = matched.filter((pattern) => pattern.verdict === 'amber');
  const ordered = [...red, ...amber];
  const winner = ordered[0];

  const flags: Flag[] = [];
  for (const type of SIGNAL_TYPES) {
    if (type !== 'money_request' && present.has(type)) {
      flags.push({ type, text: FLAG_TEXT[type] });
    }
  }

  const verdict: Verdict = winner ? winner.verdict : 'green';
  return {
    verdict,
    pattern: winner ? { id: winner.id, name: winner.name } : null,
    matched: ordered.map((pattern) => pattern.id),
    flags,
    advice: ADVICE[verdict],
  };
}
