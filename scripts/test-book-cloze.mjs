/**
 * Tests for the Book Page cloze utility (src/utils/bookCloze.ts).
 *
 * Run with:  node scripts/test-book-cloze.mjs
 * (Node >= 22.18 strips the TypeScript types from the imported .ts
 * module natively — the util is dependency-free erasable TS.)
 *
 * Fixtures are transcribed by hand from the AIMA pages Eric
 * photographed (Russell & Norvig, ch. 24-25): the self-attention
 * equations of §25.4 and the CYK-PARSE figure of ch. 24.
 */
import assert from 'node:assert/strict';
import {
  wrapAllInstances,
  removeClozeGroup,
  listClozeGroups,
  nextClozeGroup,
} from '../src/utils/bookCloze.ts';

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`ok ${passed} - ${name}`);
}

// Fixture: self-attention page (§25.4), equations as LaTeX, as the
// vision transcription would produce them.
const ATTENTION_PAGE = [
  'The query vector $\\mathbf{q}_i = \\mathbf{W}_q\\mathbf{x}_i$ is the one being *attended from*, like the target in the standard attention mechanism.',
  '',
  'The encoding results of the $i$th word, $\\mathbf{c}_i$, can be calculated by applying an attention mechanism to the projected vectors:',
  '',
  '$$r_{ij} = (\\mathbf{q}_i \\cdot \\mathbf{k}_j)/\\sqrt{d}$$',
  '',
  '$$a_{ij} = e^{r_{ij}}/(\\sum_k e^{r_{ik}})$$',
  '',
  '$$\\mathbf{c}_i = \\sum_j a_{ij} \\cdot \\mathbf{v}_j$$',
  '',
  'Context is learned from training examples, not prespecified. The context-based summarization uses the whole context of the sentence.',
].join('\n');

// Fixture: CYK-PARSE pseudocode figure (ch. 24), in a fenced block.
const CYK_PAGE = [
  'The CYK algorithm for parsing:',
  '',
  '```',
  'function CYK-PARSE(words, grammar) returns a table of parse trees',
  '  inputs: words, a list of words',
  '  for each (X, p) in grammar.LEXICALRULES(words_i) do',
  '    P[X, i, i] <- p',
  '    T[X, i, i] <- TREE(X, words_i)',
  '  return SUBSPANS(N)',
  '```',
  '',
  'The function SUBSPANS returns all tuples (i, j, k) covering a span.',
].join('\n');

test('(a) prose term occurring 3 times -> all wrapped with the same group number', () => {
  const result = wrapAllInstances(ATTENTION_PAGE, 'context');
  assert.equal(result.count, 3);
  assert.equal(result.group, 1);
  // Sentence-initial "Context" matched case-insensitively, casing preserved
  assert.ok(result.text.includes('{{1::Context}} is learned'));
  assert.equal((result.text.match(/\{\{1::[Cc]ontext\}\}/g) || []).length, 3);
  const groups = listClozeGroups(result.text);
  assert.deepEqual(groups, [{ group: 1, term: 'Context', count: 3 }]);
});

test('(b) selecting \\mathbf{W}_q inside a $...$ span -> wrapped in place, delimiters intact', () => {
  const result = wrapAllInstances(ATTENTION_PAGE, '\\mathbf{W}_q');
  assert.equal(result.count, 1);
  assert.ok(
    result.text.includes('$\\mathbf{q}_i = {{1::\\mathbf{W}_q}}\\mathbf{x}_i$'),
    'math delimiters and surrounding LaTeX must be untouched'
  );
});

test('(c) selecting a token inside a fenced code block -> wrapped', () => {
  const result = wrapAllInstances(CYK_PAGE, 'SUBSPANS');
  // Once inside the fence, once in the prose below it: same group.
  assert.equal(result.count, 2);
  assert.ok(result.text.includes('return {{1::SUBSPANS}}(N)'));
  assert.ok(result.text.includes('The function {{1::SUBSPANS}} returns'));
  assert.ok(result.text.startsWith('The CYK algorithm'));
  assert.ok(result.text.includes('```'));
});

test('(d) removing a group unwraps it and renumbers later groups down', () => {
  let text = wrapAllInstances(ATTENTION_PAGE, 'attention').text;
  text = wrapAllInstances(text, 'context').text;
  assert.deepEqual(
    listClozeGroups(text).map((g) => g.group),
    [1, 2]
  );
  const after = removeClozeGroup(text, 1);
  assert.ok(!after.includes('::attention'), 'group 1 term unwrapped');
  assert.ok(after.includes('attention mechanism'), 'unwrapped text restored');
  const groups = listClozeGroups(after);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].group, 1, 'old group 2 renumbered to 1');
  assert.equal(groups[0].term, 'Context');
  assert.equal(groups[0].count, 3);
  assert.equal(nextClozeGroup(after), 2);
});

test('(e) a fragment ending in } gets the guard space, and unwrap round-trips exactly', () => {
  const original = 'The weight is $\\frac{1}{2}$ of the total.';
  const result = wrapAllInstances(original, '\\frac{1}{2}');
  assert.equal(result.count, 1);
  assert.ok(
    result.text.includes('{{1::\\frac{1}{2} }}'),
    'space inserted before the closing }} so the fragment brace cannot close the cloze early'
  );
  const restored = removeClozeGroup(result.text, 1);
  assert.equal(restored, original, 'unwrap must restore the original text exactly');
});

test('(f) already-clozed instances are never re-wrapped', () => {
  const once = wrapAllInstances(ATTENTION_PAGE, 'context');
  const twice = wrapAllInstances(once.text, 'context');
  assert.equal(twice.count, 0);
  assert.equal(twice.text, once.text);
});

test('(g) whitespace in the selection matches flexibly across line breaks', () => {
  const page = 'One way to address that is called multiheaded\nattention. We divide the sentence up.';
  const result = wrapAllInstances(page, 'multiheaded attention');
  assert.equal(result.count, 1);
  assert.ok(result.text.includes('{{1::multiheaded\nattention}}'));
});

test('(h) uppercase terms match case-sensitively (no false hits on different case)', () => {
  const page = 'The value vector and the Value of the firm differ.';
  const result = wrapAllInstances(page, 'Value');
  assert.equal(result.count, 1);
  assert.ok(result.text.includes('the {{1::Value}} of the firm'));
});

console.log(`\nAll ${passed} book-cloze tests passed.`);
