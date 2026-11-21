// Checks a pattern set that arrived from outside, such as Remote Config.
//
// A remote pattern set decides verdicts, so a broken one must never be used.
// Anything that is not exactly the expected shape is refused, and the
// built-in patterns are used in its place.

import { DEFAULT_RULES } from './defaults.ts';
import { SIGNAL_TYPES } from './engine.ts';
import type { Pattern, RuleSet, SignalType } from './engine.ts';

export type Parsed = { ok: true; rules: RuleSet } | { ok: false; problem: string };

export interface ChosenRules {
  rules: RuleSet;
  source: 'remote' | 'default';
  /** Why the remote set was not used, when one was offered and refused. */
  problem?: string;
}

const MAX_PATTERNS = 100;
const PATTERN_ID = /^[a-z][a-z0-9_]{0,63}$/;
const KNOWN: readonly string[] = SIGNAL_TYPES;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function signalList(value: unknown): SignalType[] | null {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string' && KNOWN.includes(item))) {
    return null;
  }
  return value as SignalType[];
}

function parsePattern(value: unknown): Pattern | string {
  if (!isRecord(value)) {
    return 'a pattern is not an object';
  }
  const { id, name, verdict } = value;
  if (typeof id !== 'string' || !PATTERN_ID.test(id)) {
    return 'a pattern has no valid id';
  }
  if (typeof name !== 'string' || name.trim() === '' || name.length > 80) {
    return `pattern "${id}" has no valid name`;
  }
  if (verdict !== 'amber' && verdict !== 'red') {
    return `pattern "${id}" must have the verdict amber or red`;
  }
  const all = signalList(value.all);
  if (!all) {
    return `pattern "${id}" lists an unknown signal`;
  }
  const pattern: Pattern = { id, name, verdict, all };

  if (value.any !== undefined) {
    const any = signalList(value.any);
    if (!any) {
      return `pattern "${id}" lists an unknown signal`;
    }
    pattern.any = any;
  }
  if (value.minAny !== undefined) {
    const { minAny } = value;
    const size = pattern.any?.length ?? 0;
    if (typeof minAny !== 'number' || !Number.isInteger(minAny) || minAny < 1 || minAny > size) {
      return `pattern "${id}" asks for more signals than it lists`;
    }
    pattern.minAny = minAny;
  }
  if (all.length === 0 && (pattern.any?.length ?? 0) === 0) {
    return `pattern "${id}" would match everything`;
  }
  return pattern;
}

export function parseRuleSet(value: unknown): Parsed {
  if (!isRecord(value)) {
    return { ok: false, problem: 'the pattern set is not an object' };
  }
  const { version, patterns } = value;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
    return { ok: false, problem: 'the version is not a whole number' };
  }
  if (!Array.isArray(patterns) || patterns.length === 0 || patterns.length > MAX_PATTERNS) {
    return { ok: false, problem: `there must be between 1 and ${MAX_PATTERNS} patterns` };
  }
  const parsed: Pattern[] = [];
  const seen = new Set<string>();
  for (const item of patterns) {
    const pattern = parsePattern(item);
    if (typeof pattern === 'string') {
      return { ok: false, problem: pattern };
    }
    if (seen.has(pattern.id)) {
      return { ok: false, problem: `two patterns share the id "${pattern.id}"` };
    }
    seen.add(pattern.id);
    parsed.push(pattern);
  }
  return { ok: true, rules: { version, patterns: parsed } };
}

/** The remote pattern set if it is valid, and the built-in one if it is not. */
export function chooseRules(remote: string | null | undefined): ChosenRules {
  if (remote === null || remote === undefined || remote.trim() === '') {
    return { rules: DEFAULT_RULES, source: 'default' };
  }
  let value: unknown;
  try {
    value = JSON.parse(remote);
  } catch {
    return { rules: DEFAULT_RULES, source: 'default', problem: 'the remote pattern set is not valid JSON' };
  }
  const parsed = parseRuleSet(value);
  if (!parsed.ok) {
    return { rules: DEFAULT_RULES, source: 'default', problem: parsed.problem };
  }
  return { rules: parsed.rules, source: 'remote' };
}
