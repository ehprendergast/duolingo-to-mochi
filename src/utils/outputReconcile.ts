/**
 * Merging upstream text-pair changes into the editable final output.
 *
 * The final output box is user-editable, and those manual edits are the
 * source of truth for what gets copied/downloaded. When a text pair is
 * later changed in its own per-image editor, the change must flow into
 * the final box WITHOUT overwriting manual edits the user made to
 * other cards.
 *
 * Model: the output is a sequence of card blocks joined by "\n-----\n"
 * (the Mochi separator produced by formatTextPairs). For each card we
 * remember the block text as last generated. On an upstream change:
 *
 * - A card whose current text still matches its last generated block
 *   has not been manually edited, so it is replaced with the newly
 *   generated block (the upstream change propagates).
 * - A card whose current text differs from its last generated block
 *   was manually edited in the final box; the user's text wins and is
 *   left untouched (manual edits are sticky per card).
 * - Cards added upstream are inserted in pair order; cards deleted
 *   upstream are removed.
 *
 * If the user's edits have restructured the separators so the box can
 * no longer be split into the expected number of cards, we fall back
 * to exact-match replacement: a changed card is updated only where
 * its previous generated text still appears verbatim, new cards are
 * appended, and everything else is left exactly as the user wrote it.
 */

export interface OutputBlock {
  id: string;
  block: string;
}

export const OUTPUT_SEPARATOR = '\n-----\n';

export const joinOutputBlocks = (blocks: OutputBlock[]): string =>
  blocks.map((b) => b.block).join(OUTPUT_SEPARATOR);

const sameBlocks = (a: OutputBlock[], b: OutputBlock[]): boolean =>
  a.length === b.length &&
  a.every((block, i) => block.id === b[i].id && block.block === b[i].block);

const removeBlockOnce = (text: string, block: string): string => {
  if (text.includes(block + OUTPUT_SEPARATOR)) {
    return text.replace(block + OUTPUT_SEPARATOR, '');
  }
  if (text.includes(OUTPUT_SEPARATOR + block)) {
    return text.replace(OUTPUT_SEPARATOR + block, '');
  }
  if (text === block) return '';
  return text.replace(block, '');
};

export const reconcileOutputText = (
  currentText: string,
  prevBlocks: OutputBlock[],
  nextBlocks: OutputBlock[]
): string => {
  // First generation: nothing manual to preserve yet.
  if (prevBlocks.length === 0) {
    return joinOutputBlocks(nextBlocks);
  }

  // Nothing changed upstream: leave the user's text exactly as-is.
  if (sameBlocks(prevBlocks, nextBlocks)) {
    return currentText;
  }

  // Primary path: the box still splits into one segment per old card.
  const segments = currentText.split(OUTPUT_SEPARATOR);
  if (segments.length === prevBlocks.length) {
    const prevById = new Map(
      prevBlocks.map((b, index) => [b.id, { index, block: b.block }])
    );

    const nextSegments = nextBlocks.map((next) => {
      const prev = prevById.get(next.id);
      if (!prev) return next.block; // newly added card
      const currentSegment = segments[prev.index];
      // Untouched since generation -> propagate the upstream change.
      // Differs -> the user edited this card by hand; keep their text.
      return currentSegment === prev.block ? next.block : currentSegment;
    });

    return nextSegments.join(OUTPUT_SEPARATOR);
  }

  // Fallback: the user restructured the text (e.g. edited separators),
  // so merge conservatively with exact-match surgery only.
  if (currentText.trim() === '') {
    return joinOutputBlocks(nextBlocks);
  }

  const prevById = new Map(prevBlocks.map((b) => [b.id, b.block]));
  const nextIds = new Set(nextBlocks.map((b) => b.id));
  let result = currentText;

  // Changed cards: replace the old generated text where it survives.
  for (const next of nextBlocks) {
    const prevBlock = prevById.get(next.id);
    if (prevBlock !== undefined && prevBlock !== next.block) {
      if (result.includes(prevBlock)) {
        result = result.replace(prevBlock, next.block);
      }
    }
  }

  // Deleted cards: remove their generated text if it survives.
  for (const prev of prevBlocks) {
    if (!nextIds.has(prev.id) && result.includes(prev.block)) {
      result = removeBlockOnce(result, prev.block);
    }
  }

  // Added cards: append in pair order.
  for (const next of nextBlocks) {
    if (!prevById.has(next.id)) {
      result = result.trim() === '' ? next.block : result + OUTPUT_SEPARATOR + next.block;
    }
  }

  return result;
};
