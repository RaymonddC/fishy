// Removes identifying details from a message before it may go to the cloud.
//
// Fixed rules only: no model is involved, so the same text always gives the
// same result. Each detail becomes a numbered placeholder such as [NAME_1],
// and the same detail always gets the same placeholder, so the cloud model can
// still follow who asked for what without learning who or what it was.
//
// This is the first, minimal rule set. When in doubt it removes too much: a
// date that looks like an account number is redacted too.
//
// Known gap: a first name that stands alone as the first word of a sentence
// ("Budi here.") is only removed when it is in the list of known names.

export type RedactionKind = 'EMAIL' | 'LINK' | 'AMOUNT' | 'PHONE' | 'ACCOUNT' | 'NAME';

export interface Redaction {
  /** The text that is safe to send. */
  text: string;
  /** How many distinct details were removed, by kind. */
  counts: Record<RedactionKind, number>;
  /** How many distinct details were removed in total. */
  total: number;
}

const CURRENCY = String.raw`(?:Rp\.?|IDR|USD|US\$|SGD|S\$|EUR|\$|€)`;
const MAGNITUDE = String.raw`(?:thousand|million|billion|trillion|ribu|juta|miliar|triliun|bn|[kKmMbB])`;
const MONEY_WORD = String.raw`(?:rupiah|dollars?|euros?)`;
const NUMBER = String.raw`\d[\d.,]*\d|\d`;

// The order matters. Emails contain domains, links contain digits, amounts and
// phone numbers contain digit runs that would otherwise look like accounts.
const RULES: ReadonlyArray<{ kind: Exclude<RedactionKind, 'NAME'>; pattern: RegExp }> = [
  { kind: 'EMAIL', pattern: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g },
  {
    kind: 'LINK',
    pattern: /\bhttps?:\/\/[^\s<>"')\]]*[^\s<>"')\].,;:!?]|\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s<>"')\]]*[^\s<>"')\].,;:!?])?/gi,
  },
  {
    kind: 'AMOUNT',
    pattern: new RegExp(
      [
        String.raw`${CURRENCY}\s?(?:${NUMBER})(?:\s?${MAGNITUDE}\b)?(?:\s${MONEY_WORD}\b)?`,
        String.raw`\b(?:${NUMBER})\s?${MAGNITUDE}\b(?:\s${MONEY_WORD}\b)?`,
        String.raw`\b(?:${NUMBER})\s${MONEY_WORD}\b`,
      ].join('|'),
      'g',
    ),
  },
  {
    kind: 'PHONE',
    pattern: /\+\d[\d\s().-]{6,}\d|\b0\d{2,3}[\s.-]?\d{3,4}[\s.-]?\d{3,5}\b/g,
  },
  { kind: 'ACCOUNT', pattern: /\b\d(?:[\s-]?\d){5,}\b/g },
];

// Capitalised words that are not names. A capitalised word outside this list,
// anywhere but the first word of a sentence, is treated as a name.
const ORDINARY_WORDS: ReadonlySet<string> = new Set(
  [
    // openers and function words
    'a an and as at but by for from if in of on or so the to with without',
    'this that these those there here it its he she they we you my our your his her their',
    'is are was were be been do does did not no yes can could will would should must may need',
    'please kindly hi hello hey dear thanks thank regards sincerely best cheers ok okay',
    'also then now today tomorrow yesterday tonight once just after before let',
    // what a payment request talks about
    'make send transfer pay wire keep call reply ask tell see check confirm approve use update change note',
    'subject details attached invoice payment account bank amount urgent confidential important private secret',
    // roles and departments: these carry the "authority" signal, so they stay
    'chief executive financial finance officer director manager president chairman chair head board',
    'treasurer treasury controller accountant accounts accounting payable receivable legal audit compliance',
    'team department supplier vendor customer client company management',
    // days and months
    'monday tuesday wednesday thursday friday saturday sunday',
    'january february march april june july august september october november december',
  ]
    .join(' ')
    .split(' '),
);

// One capitalised word: starts with a capital and has at least one lower-case
// letter, so acronyms such as CFO are left alone.
const CAPITALISED = String.raw`\p{Lu}[\p{L}'’-]*\p{Ll}[\p{L}'’-]*`;
const CAPITALISED_RUN = new RegExp(String.raw`${CAPITALISED}(?: ${CAPITALISED})*`, 'gu');

function startsSentence(text: string, offset: number): boolean {
  let index = offset - 1;
  while (index >= 0 && (text[index] === ' ' || text[index] === '\t')) {
    index -= 1;
  }
  if (index < 0) {
    return true;
  }
  const before = text[index];
  if (before === '.' || before === '!' || before === '?' || before === '\n' || before === '\r') {
    return true;
  }
  // "[NAME_1]: Understood" is a speaker label followed by the start of what they said.
  return before === ':' && text[index - 1] === ']';
}

/**
 * Replaces names that nobody listed in advance. Within a run of capitalised
 * words, neighbouring words that are not ordinary words form one name. The
 * single first word of a sentence is kept, because every sentence starts with
 * a capital; a known first name in that position is caught by the directory
 * list instead.
 */
function replaceUnlistedNames(text: string, replace: (name: string) => string): string {
  return text.replace(CAPITALISED_RUN, (run: string, offset: number) => {
    const words = run.split(' ');
    const atSentenceStart = startsSentence(text, offset);
    const out: string[] = [];
    let name: string[] = [];
    let nameStart = 0;

    const flush = (): void => {
      if (name.length === 0) {
        return;
      }
      const loneOpener = atSentenceStart && nameStart === 0 && name.length === 1;
      out.push(loneOpener ? name.join(' ') : replace(name.join(' ')));
      name = [];
    };

    words.forEach((word, index) => {
      if (ORDINARY_WORDS.has(word.toLowerCase())) {
        flush();
        out.push(word);
        return;
      }
      if (name.length === 0) {
        nameStart = index;
      }
      name.push(word);
    });
    flush();
    return out.join(' ');
  });
}

function escapeForPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function namePattern(names: readonly string[]): RegExp | null {
  const cleaned = [...new Set(names.map((name) => name.trim()).filter((name) => name.length > 1))];
  if (cleaned.length === 0) {
    return null;
  }
  // Longest first, so "Budi Prakoso" is taken whole before "Budi" alone.
  cleaned.sort((a, b) => b.length - a.length);
  const alternatives = cleaned.map(escapeForPattern).join('|');
  return new RegExp(String.raw`(?<![\p{L}\p{N}])(?:${alternatives})(?![\p{L}\p{N}])`, 'giu');
}

/**
 * @param knownNames People and company names to remove, usually from the
 *   directory. Matching ignores case and only takes whole words.
 */
export function redact(text: string, knownNames: readonly string[] = []): Redaction {
  const counts: Record<RedactionKind, number> = { EMAIL: 0, LINK: 0, AMOUNT: 0, PHONE: 0, ACCOUNT: 0, NAME: 0 };
  const seen = new Map<string, string>();

  const replaceWith = (kind: RedactionKind) => (match: string): string => {
    const key = `${kind}:${match.toLowerCase().replace(/\s+/g, ' ')}`;
    const existing = seen.get(key);
    if (existing) {
      return existing;
    }
    counts[kind] += 1;
    const placeholder = `[${kind}_${counts[kind]}]`;
    seen.set(key, placeholder);
    return placeholder;
  };

  let out = text;
  for (const rule of RULES) {
    out = out.replace(rule.pattern, replaceWith(rule.kind));
  }
  const names = namePattern(knownNames);
  if (names) {
    out = out.replace(names, replaceWith('NAME'));
  }
  out = replaceUnlistedNames(out, replaceWith('NAME'));

  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return { text: out, counts, total };
}
