// Output scrubber: finds the secret word in streamed text even when it is spaced out,
// leetspeaked, reversed, ROT13'd, written in look-alike letters (Cyrillic, fullwidth,
// math-bold, accented…), or split by zero-width/markdown characters.
//
// It does NOT catch acrostics, phonetic alphabets, translations, base64, or the word
// smuggled across several replies. Those are the intended attack surface of the game.

export const SEAL = '▓▓▓▓▓';

// Look-alikes that Unicode compatibility folding (NFKD) does not map back to ASCII.
const LOOKALIKES = {
  a: '4@аα', b: '8вь', c: '(<¢сς', d: 'ԁ', e: '3€еε', f: 'ƒ', g: '96ɡ', h: '#һн',
  i: '1!|lіıι', j: 'ј', k: 'κк', l: '1|!iӏ', m: 'м', n: 'ηп', o: '0оοσ', p: 'рρ', q: '9',
  r: 'г', s: '5$zѕ', t: '7+т', u: 'μυ', v: 'ν', w: 'ω', x: '×хχ', y: 'уγ', z: '2',
};

const MARKS = /\p{M}/gu;

// Per-code-point folding: compatibility-decompose, drop combining marks, lowercase.
// Keeps a map from each folded code unit back to the raw string so matches can be
// redacted in the original text.
export function fold(raw) {
  const parts = [];
  const src = [];
  const end = [];
  for (let i = 0; i < raw.length;) {
    const cp = raw.codePointAt(i);
    const width = cp > 0xffff ? 2 : 1;
    let piece;
    if (cp < 0x80) piece = cp >= 65 && cp <= 90 ? String.fromCharCode(cp + 32) : raw[i];
    else piece = String.fromCodePoint(cp).normalize('NFKD').replace(MARKS, '').toLowerCase();
    for (let k = 0; k < piece.length; k++) { src.push(i); end.push(i + width); }
    parts.push(piece);
    i += width;
  }
  return { norm: parts.join(''), src, end };
}

export function canonical(text) {
  return fold(String(text)).norm.replace(/[^\p{L}\p{N}]/gu, '');
}

const escapeClass = (s) => s.replace(/[\\\]\[^-]/g, '\\$&');

function charClass(ch) {
  let set = ch + (LOOKALIKES[ch] ?? '');
  const code = ch.charCodeAt(0);
  if (code >= 97 && code <= 122) set += String.fromCodePoint(0x1f1e6 + code - 97); // regional indicator 🇦..🇿
  return `[${escapeClass(set)}]`;
}

const rot13 = (ch) => ch.replace(/[a-z]/, (c) => String.fromCharCode(((c.charCodeAt(0) - 97 + 13) % 26) + 97));

export function compileSecretMatcher(secret, { maxGap = 6 } = {}) {
  const letters = [...canonical(secret)];
  if (letters.length < 3) throw new Error('KNOX_SECRET must contain at least 3 letters or digits');
  const variants = [letters, [...letters].reverse(), letters.map(rot13)];
  const gap = `[^\\p{L}\\p{N}]{0,${maxGap}}`;
  const source = [...new Set(variants.map((v) => v.map(charClass).join(gap)))].join('|');
  return {
    regex: new RegExp(source, 'giu'),
    // Longest raw span a single match can cover (in folded code units).
    span: letters.length + (letters.length - 1) * maxGap,
  };
}

const isLowSurrogate = (code) => code >= 0xdc00 && code <= 0xdfff;

// Streaming wrapper. Holds back enough trailing text that a match can never straddle
// what was already emitted (2x the folded span, since combining marks and astral
// look-alikes take more raw code units than they fold to). `hold: Infinity` buffers
// everything until flush().
export class StreamScrubber {
  constructor(matcher, { hold, replacement = SEAL } = {}) {
    this.regex = new RegExp(matcher.regex.source, matcher.regex.flags);
    this.hold = hold ?? matcher.span * 2 + 16;
    this.replacement = replacement;
    this.buf = '';
    this.hits = 0;
  }

  push(text) {
    this.buf += text;
    if (this.hold === Infinity) return '';
    this.#scan();
    return this.#take(this.buf.length - this.hold);
  }

  flush() {
    this.#scan();
    return this.#take(this.buf.length);
  }

  #take(cut) {
    if (cut <= 0) return '';
    if (cut < this.buf.length && isLowSurrogate(this.buf.charCodeAt(cut))) cut--;
    const out = this.buf.slice(0, cut);
    this.buf = this.buf.slice(cut);
    return out;
  }

  #scan() {
    const { norm, src, end } = fold(this.buf);
    const re = this.regex;
    re.lastIndex = 0;
    const spans = [];
    let m;
    while ((m = re.exec(norm))) {
      spans.push([src[m.index], end[m.index + m[0].length - 1]]);
    }
    if (!spans.length) return;
    this.hits += spans.length;
    let out = '';
    let pos = 0;
    for (const [a, b] of spans) {
      if (a < pos) continue;
      out += this.buf.slice(pos, a) + this.replacement;
      pos = b;
    }
    this.buf = out + this.buf.slice(pos);
  }
}
