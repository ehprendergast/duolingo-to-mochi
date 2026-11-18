/**
 * Cloze logic for Book Page mode.
 *
 * Mochi cloze syntax (per Mochi's docs — NOT Anki's):
 *  - Simple cloze: {{text}} — all simple deletions on a card hide together.
 *  - Numbered groups: {{1::text}}, {{2::text}} — all instances sharing a
 *    number hide together as one card version; different numbers are
 *    separate card versions. There is NO "c" prefix (Anki's {{c1::}} is
 *    wrong for Mochi).
 *
 * Book mode uses one number per distinct term, with EVERY occurrence of
 * the term wrapped in that group, so each term becomes one card version
 * no matter how many times it appears in the passage.
 *
 * This module is dependency-free and side-effect-free so it can be unit
 * tested directly from Node (see scripts/test-book-cloze.mjs).
 */

export interface ClozeGroupInfo {
  /** Group number as it appears in {{N::...}} */
  group: number;
  /** The wrapped text of the first occurrence (guard space removed) */
  term: string;
  /** How many wrapped instances of this group exist in the text */
  count: number;
}

export interface WrapResult {
  /** The passage with all instances wrapped (unchanged if count is 0) */
  text: string;
  /** Number of occurrences wrapped */
  count: number;
  /** The group number assigned, or null when nothing was wrapped */
  group: number | null;
  /** The trimmed term that was searched for */
  term: string;
}

/** Matches one numbered cloze: {{N::...}} (non-greedy to the first }}). */
const CLOZE_RE = /\{\{(\d+)::([\s\S]*?)\}\}/g;

/** Matches any {{...}} span, numbered or simple. */
const ANY_CLOZE_RE = /\{\{[\s\S]*?\}\}/g;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Wrap a single fragment in a numbered cloze marker.
 *
 * Brace safety: if the fragment ends with '}' (e.g. the LaTeX fragment
 * "\frac{1}{2}") or contains '}}', writing {{N::...}} directly would put
 * the fragment's own braces immediately against the cloze's closing
 * '}}', and a non-greedy parser (Mochi's, and ours) would end the cloze
 * early and corrupt the fragment. Inserting a single space before the
 * closing '}}' prevents that: the fragment's braces can no longer be
 * mistaken for the cloze terminator. The space is invisible in prose
 * and ignored by KaTeX in math mode. stripGuardSpace removes it again
 * when a group is unwrapped, so wrap/unwrap round-trips exactly.
 */
function wrapFragment(group: number, fragment: string): string {
  const needsGuard = fragment.endsWith('}') || fragment.includes('}}');
  return `{{${group}::${fragment}${needsGuard ? ' ' : ''}}}`;
}

/** Remove the single guard space added by wrapFragment, if present. */
export function stripGuardSpace(inner: string): string {
  if (inner.length > 1 && inner.endsWith(' ')) {
    const core = inner.slice(0, -1);
    if (core.endsWith('}') || core.includes('}}')) return core;
  }
  return inner;
}

interface Range {
  start: number;
  end: number;
}

/** Character ranges occupied by existing clozes — never match inside these. */
function findClozeRanges(text: string): Range[] {
  const ranges: Range[] = [];
  const re = new RegExp(ANY_CLOZE_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    ranges.push({ start: m.index, end: m.index + m[0].length });
    if (m[0].length === 0) re.lastIndex++;
  }
  return ranges;
}

/**
 * Build the search regex for a term:
 *  - Regex metacharacters in the term are escaped (terms come from raw
 *    selections: LaTeX fragments, code tokens, prose).
 *  - Each run of whitespace in the term becomes \s+, so a phrase still
 *    matches when the passage wraps it across lines.
 *  - If the term is all-lowercase prose, matching is case-insensitive
 *    (so "grammar" also catches "Grammar" at a sentence start); each
 *    occurrence keeps its own casing inside its braces. Terms with any
 *    uppercase (LaTeX \mathbf{W}_q, code identifiers like PYZ) match
 *    case-sensitively.
 */
function buildTermRegex(term: string): RegExp {
  const pattern = term
    .split(/(\s+)/)
    .map((part) => (/^\s+$/.test(part) ? '\\s+' : escapeRegExp(part)))
    .join('');
  const hasCasedLetter = term.toLowerCase() !== term.toUpperCase();
  const allLowercase = hasCasedLetter && term === term.toLowerCase();
  return new RegExp(pattern, allLowercase ? 'gi' : 'g');
}

/** The next unused cloze group number in the text (1-based). */
export function nextClozeGroup(text: string): number {
  let max = 0;
  const re = new RegExp(CLOZE_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = parseInt(m[1], 10);
    if (n > max) max = n;
  }
  return max + 1;
}

/**
 * Wrap EVERY occurrence of `rawSelection` in the text as a new numbered
 * cloze group. Occurrences inside an existing cloze are skipped, so
 * already-wrapped terms are never double-wrapped or corrupted.
 * Replacements are applied right-to-left so earlier offsets stay valid.
 */
export function wrapAllInstances(text: string, rawSelection: string): WrapResult {
  const term = rawSelection.trim();
  if (!term) return { text, count: 0, group: null, term: '' };

  const group = nextClozeGroup(text);
  const re = buildTermRegex(term);
  const protectedRanges = findClozeRanges(text);

  const matches: { start: number; end: number; value: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    const start = m.index;
    const end = start + m[0].length;
    const insideCloze = protectedRanges.some((r) => start < r.end && end > r.start);
    if (!insideCloze) matches.push({ start, end, value: m[0] });
  }

  if (matches.length === 0) return { text, count: 0, group: null, term };

  let result = text;
  for (let i = matches.length - 1; i >= 0; i--) {
    const { start, end, value } = matches[i];
    result = result.slice(0, start) + wrapFragment(group, value) + result.slice(end);
  }
  return { text: result, count: matches.length, group, term };
}

/** All numbered cloze groups present in the text, in group order. */
export function listClozeGroups(text: string): ClozeGroupInfo[] {
  const byGroup = new Map<number, ClozeGroupInfo>();
  const re = new RegExp(CLOZE_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const group = parseInt(m[1], 10);
    const existing = byGroup.get(group);
    if (existing) {
      existing.count += 1;
    } else {
      byGroup.set(group, { group, term: stripGuardSpace(m[2]), count: 1 });
    }
  }
  return [...byGroup.values()].sort((a, b) => a.group - b.group);
}

/**
 * Unwrap every instance of one group and renumber all later groups down
 * by one, so group numbers stay a dense 1..N sequence in order added.
 * Done in a single regex pass so renumbering can't collide with itself.
 */
export function removeClozeGroup(text: string, groupToRemove: number): string {
  const re = new RegExp(CLOZE_RE.source, 'g');
  return text.replace(re, (whole, numStr: string, inner: string) => {
    const n = parseInt(numStr, 10);
    if (n === groupToRemove) return stripGuardSpace(inner);
    if (n > groupToRemove) return `{{${n - 1}::${inner}}}`;
    return whole;
  });
}

/** True if the text contains any cloze markup at all. */
export function hasAnyCloze(text: string): boolean {
  return text.includes('{{');
}

/**
 * Split a passage into the cloze / non-cloze segments of one numbered
 * group-aware pass. Used by the preview renderer; exported for reuse.
 * Segments of kind 'cloze' carry the group number and the raw inner
 * text (guard space already stripped).
 */
export type PassageSegment =
  | { kind: 'text'; value: string }
  | { kind: 'cloze'; group: number | null; value: string };

export function splitClozeSegments(text: string): PassageSegment[] {
  const segments: PassageSegment[] = [];
  const re = /\{\{(?:(\d+)::)?([\s\S]*?)\}\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segments.push({ kind: 'text', value: text.slice(last, m.index) });
    segments.push({
      kind: 'cloze',
      group: m[1] ? parseInt(m[1], 10) : null,
      value: stripGuardSpace(m[2]),
    });
    last = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++;
  }
  if (last < text.length) segments.push({ kind: 'text', value: text.slice(last) });
  return segments;
}
