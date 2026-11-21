// R2: "Same signals give the same verdict."
//
// The verdict is decided by fixed rules, never by a model. These tests pin
// that: the same set of signals gives the same answer however many times and
// in whatever order it is asked.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { DEFAULT_RULES } from '../src/core/rules/defaults.ts';
import { decide, SIGNAL_TYPES } from '../src/core/rules/engine.ts';
import type { RuleSet, Signal, SignalType } from '../src/core/rules/engine.ts';
import { chooseRules, parseRuleSet } from '../src/core/rules/validate.ts';

const signals = (...types: SignalType[]): Signal[] => types.map((type) => ({ type }));

// The two demo stories, and ordinary requests that share some of their words.
const STORIES: Record<string, { signals: Signal[]; verdict: 'green' | 'amber' | 'red' }> = {
  'fake CFO in a meeting': {
    signals: signals('money_request', 'tactic_authority', 'tactic_urgency', 'tactic_secrecy', 'payment_details_change'),
    verdict: 'red',
  },
  'fake supplier invoice by email': {
    signals: signals(
      'money_request',
      'tactic_urgency',
      'payment_details_change',
      'sender_lookalike_domain',
      'link_text_mismatch',
      'bank_account_changed',
      'invoice_amount_unusual',
      'document_edited',
      'known_bad_account',
      'known_bad_domain',
    ),
    verdict: 'red',
  },
  'bank details changed, nothing else': { signals: signals('money_request', 'bank_account_changed'), verdict: 'amber' },
  'two kinds of pressure to pay': { signals: signals('money_request', 'tactic_authority', 'tactic_urgency'), verdict: 'amber' },
  'routine invoice': { signals: signals('money_request'), verdict: 'green' },
  'reminder that an invoice is due on Friday': { signals: signals('money_request', 'tactic_urgency'), verdict: 'green' },
  'urgent report, no payment': { signals: signals('tactic_authority', 'tactic_urgency'), verdict: 'green' },
  'confidential salary file, no payment': { signals: signals('tactic_secrecy'), verdict: 'green' },
  'nothing at all': { signals: [], verdict: 'green' },
};

/** A small fixed-seed generator, so the shuffles are the same on every run. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other] as T, copy[index] as T];
  }
  return copy;
}

for (const [name, story] of Object.entries(STORIES)) {
  test(`${name}: ${story.verdict}, on every one of 1,000 runs in shuffled order`, () => {
    const baseline = decide(story.signals, DEFAULT_RULES);
    assert.equal(baseline.verdict, story.verdict);

    const random = seeded(20261121);
    for (let run = 0; run < 1000; run += 1) {
      assert.deepEqual(decide(shuffled(story.signals, random), DEFAULT_RULES), baseline);
    }
  });
}

test('repeating a signal, or changing its detail text, changes nothing', () => {
  const plain = decide(signals('money_request', 'bank_account_changed'), DEFAULT_RULES);
  const noisy = decide(
    [
      { type: 'bank_account_changed', detail: 'account ending 4416' },
      { type: 'money_request' },
      { type: 'bank_account_changed', detail: 'a different note' },
    ],
    DEFAULT_RULES,
  );

  assert.deepEqual(noisy, plain);
});

test('the demo stories match the patterns the deck names', () => {
  const email = decide(STORIES['fake supplier invoice by email']?.signals ?? [], DEFAULT_RULES);
  assert.equal(email.pattern?.id, 'vendor_bank_change');
  assert.equal(email.pattern?.name, 'Vendor bank change');
  assert.ok(email.matched.includes('known_bad_detail'));

  const meeting = decide(STORIES['fake CFO in a meeting']?.signals ?? [], DEFAULT_RULES);
  assert.equal(meeting.pattern?.id, 'executive_secret_transfer');
});

test('every red flag is listed once, in plain words, in a fixed order', () => {
  const decision = decide(
    signals('tactic_secrecy', 'money_request', 'tactic_authority', 'tactic_secrecy', 'known_bad_account'),
    DEFAULT_RULES,
  );

  assert.deepEqual(
    decision.flags.map((flag) => flag.type),
    ['tactic_authority', 'tactic_secrecy', 'known_bad_account'],
    'a request for money is context, not a red flag',
  );
  for (const flag of decision.flags) {
    assert.ok(flag.text.length > 10);
    assert.ok(!flag.text.includes('_'), 'flag text is for people, not a code name');
  }
});

test('every signal type has plain-word flag text', () => {
  for (const type of SIGNAL_TYPES) {
    if (type === 'money_request') {
      continue;
    }
    const [flag] = decide([{ type }], DEFAULT_RULES).flags;
    assert.equal(flag?.type, type);
    assert.ok((flag?.text.length ?? 0) > 10);
  }
});

test('a green verdict still says to call back', () => {
  const decision = decide(signals('money_request'), DEFAULT_RULES);

  assert.equal(decision.verdict, 'green');
  assert.equal(decision.pattern, null);
  assert.match(decision.advice, /call back/i);
});

test('adding a signal never lowers the verdict', () => {
  const rank = { green: 0, amber: 1, red: 2 };
  const random = seeded(7);
  for (let run = 0; run < 2000; run += 1) {
    const some = SIGNAL_TYPES.filter(() => random() < 0.3);
    const extra = SIGNAL_TYPES[Math.floor(random() * SIGNAL_TYPES.length)] as SignalType;
    const before = decide(signals(...some), DEFAULT_RULES).verdict;
    const after = decide(signals(...some, extra), DEFAULT_RULES).verdict;
    assert.ok(rank[after] >= rank[before], `${some.join(',')} + ${extra}`);
  }
});

test('swapping the pattern set changes the verdict with no code change', () => {
  const strict: RuleSet = {
    version: 2,
    patterns: [{ id: 'any_payment', name: 'Any payment request', verdict: 'red', all: ['money_request'] }],
  };

  assert.equal(decide(signals('money_request'), DEFAULT_RULES).verdict, 'green');
  assert.equal(decide(signals('money_request'), strict).verdict, 'red');
  assert.equal(decide(signals('money_request'), strict).pattern?.name, 'Any payment request');
});

test('when several patterns match, red beats amber and earlier beats later', () => {
  const rules: RuleSet = {
    version: 1,
    patterns: [
      { id: 'amber_first', name: 'Amber first', verdict: 'amber', all: ['money_request'] },
      { id: 'red_a', name: 'Red A', verdict: 'red', all: ['money_request'] },
      { id: 'red_b', name: 'Red B', verdict: 'red', all: ['money_request'] },
    ],
  };

  const decision = decide(signals('money_request'), rules);

  assert.equal(decision.pattern?.id, 'red_a');
  assert.deepEqual(decision.matched, ['red_a', 'red_b', 'amber_first']);
});

test('a pattern can ask for at least so many of a group of signals', () => {
  const rules: RuleSet = {
    version: 1,
    patterns: [
      {
        id: 'two_of_three',
        name: 'Two of three',
        verdict: 'amber',
        all: [],
        any: ['tactic_authority', 'tactic_urgency', 'tactic_secrecy'],
        minAny: 2,
      },
    ],
  };

  assert.equal(decide(signals('tactic_urgency'), rules).verdict, 'green');
  assert.equal(decide(signals('tactic_urgency', 'tactic_secrecy'), rules).verdict, 'amber');
});

test('a valid remote pattern set is used', () => {
  const remote = JSON.stringify({
    version: 9,
    patterns: [{ id: 'any_payment', name: 'Any payment request', verdict: 'red', all: ['money_request'] }],
  });

  const chosen = chooseRules(remote);

  assert.equal(chosen.source, 'remote');
  assert.equal(chosen.rules.version, 9);
  assert.equal(decide(signals('money_request'), chosen.rules).verdict, 'red');
});

for (const [name, remote] of Object.entries({
  'not JSON': '{ patterns: ',
  'not an object': '[]',
  'no patterns': JSON.stringify({ version: 1, patterns: [] }),
  'an unknown signal type': JSON.stringify({
    version: 1,
    patterns: [{ id: 'x', name: 'X', verdict: 'red', all: ['made_up_signal'] }],
  }),
  'an unknown verdict': JSON.stringify({
    version: 1,
    patterns: [{ id: 'x', name: 'X', verdict: 'green', all: ['money_request'] }],
  }),
  'a pattern that matches everything': JSON.stringify({
    version: 1,
    patterns: [{ id: 'x', name: 'X', verdict: 'red', all: [] }],
  }),
  'two patterns with the same ID': JSON.stringify({
    version: 1,
    patterns: [
      { id: 'x', name: 'X', verdict: 'red', all: ['money_request'] },
      { id: 'x', name: 'Y', verdict: 'amber', all: ['tactic_urgency'] },
    ],
  }),
  'a version that is not a whole number': JSON.stringify({
    version: 'latest',
    patterns: [{ id: 'x', name: 'X', verdict: 'red', all: ['money_request'] }],
  }),
  'an impossible minimum': JSON.stringify({
    version: 1,
    patterns: [{ id: 'x', name: 'X', verdict: 'red', all: [], any: ['tactic_urgency'], minAny: 2 }],
  }),
})) {
  test(`a remote pattern set with ${name} is ignored in favour of the defaults`, () => {
    const chosen = chooseRules(remote);

    assert.equal(chosen.source, 'default');
    assert.equal(chosen.rules, DEFAULT_RULES);
    assert.ok(chosen.problem && chosen.problem.length > 0);
  });
}

test('no remote value at all means the defaults, without a complaint', () => {
  for (const nothing of [null, '', '   ']) {
    const chosen = chooseRules(nothing);
    assert.equal(chosen.source, 'default');
    assert.equal(chosen.problem, undefined);
  }
});

test('the default patterns are themselves valid', () => {
  assert.deepEqual(parseRuleSet(JSON.parse(JSON.stringify(DEFAULT_RULES))), { ok: true, rules: DEFAULT_RULES });
});

test('the Remote Config template carries the same patterns as the defaults', () => {
  const template = JSON.parse(readFileSync(new URL('../../remoteconfig.template.json', import.meta.url), 'utf8'));
  const value = template.parameters.scam_patterns.defaultValue.value;

  assert.deepEqual(JSON.parse(value), DEFAULT_RULES);
});

test('the engine uses no clock, no randomness and no network', () => {
  for (const file of ['engine.ts', 'defaults.ts', 'validate.ts']) {
    const source = readFileSync(new URL(`../src/core/rules/${file}`, import.meta.url), 'utf8');
    assert.ok(!/\bDate\b|Math\.random|performance\.|\bfetch\s*\(|XMLHttpRequest|\bimport\s*\(/.test(source), file);
    for (const [, from] of source.matchAll(/from\s+'([^']+)'/g)) {
      assert.ok(from?.startsWith('./'), `${file} may only import its neighbours, not "${from}"`);
    }
  }
});
