// Decodes the "xn--" form of a domain name back into the letters it stands
// for, so that a name written with letters from another alphabet can be
// compared with the genuine one.
//
// This is the decoding half of RFC 3492. The browser has no built-in way to
// do it. A test compares the result with Node's own decoder.

const BASE = 36;
const T_MIN = 1;
const T_MAX = 26;
const SKEW = 38;
const DAMP = 700;
const INITIAL_BIAS = 72;
const INITIAL_N = 128;
const MAX_INT = 0x7fffffff;

function adapt(delta: number, points: number, first: boolean): number {
  let value = first ? Math.floor(delta / DAMP) : delta >> 1;
  value += Math.floor(value / points);
  let k = 0;
  while (value > ((BASE - T_MIN) * T_MAX) >> 1) {
    value = Math.floor(value / (BASE - T_MIN));
    k += BASE;
  }
  return k + Math.floor(((BASE - T_MIN + 1) * value) / (value + SKEW));
}

function digitValue(code: number): number {
  if (code >= 48 && code <= 57) return code - 22; // 0-9
  if (code >= 65 && code <= 90) return code - 65; // A-Z
  if (code >= 97 && code <= 122) return code - 97; // a-z
  return -1;
}

/** One label without its "xn--" prefix. Null if it is not valid encoded text. */
function decodeLabel(input: string): string | null {
  const output: number[] = [];
  const lastHyphen = Math.max(input.lastIndexOf('-'), 0);
  for (let index = 0; index < lastHyphen; index += 1) {
    const code = input.charCodeAt(index);
    if (code >= 128) {
      return null;
    }
    output.push(code);
  }

  let n = INITIAL_N;
  let i = 0;
  let bias = INITIAL_BIAS;
  let index = lastHyphen > 0 ? lastHyphen + 1 : 0;
  while (index < input.length) {
    const before = i;
    let weight = 1;
    for (let k = BASE; ; k += BASE) {
      if (index >= input.length) {
        return null;
      }
      const digit = digitValue(input.charCodeAt(index));
      index += 1;
      if (digit < 0 || digit > Math.floor((MAX_INT - i) / weight)) {
        return null;
      }
      i += digit * weight;
      const threshold = k <= bias ? T_MIN : k >= bias + T_MAX ? T_MAX : k - bias;
      if (digit < threshold) {
        break;
      }
      weight *= BASE - threshold;
      if (weight > MAX_INT) {
        return null;
      }
    }
    const length = output.length + 1;
    bias = adapt(i - before, length, before === 0);
    n += Math.floor(i / length);
    if (n > 0x10ffff) {
      return null;
    }
    i %= length;
    output.splice(i, 0, n);
    i += 1;
  }
  return String.fromCodePoint(...output);
}

/** The domain with every "xn--" label decoded. A label that cannot be decoded is left as it is. */
export function toUnicodeDomain(domain: string): string {
  return domain
    .split('.')
    .map((label) => (label.toLowerCase().startsWith('xn--') ? (decodeLabel(label.slice(4)) ?? label) : label))
    .join('.');
}
