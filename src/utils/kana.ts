/**
 * Kana conversion and Japanese character detection utilities
 * No external dependencies — handles katakana ↔ hiragana conversion
 * and kanji detection for furigana features
 */

export const KATAKANA_START = 0x30A1;
export const KATAKANA_END = 0x30F6;
export const HIRAGANA_START = 0x3041;
export const HIRAGANA_END = 0x3096;

// Common Japanese particles for smart POS filtering
export const PARTICLES = new Set([
  'は', 'が', 'を', 'に', 'へ', 'と', 'で', 'か', 'ね', 'よ', 'も', 'の',
  'や', 'から', 'まで', 'より', 'だけ', 'ばかり', 'しか', 'こそ', 'さえ',
  'でも', 'って', 'にて', 'として', 'わ', 'な', 'なあ', 'よね', 'かしら',
  'けれど', 'けど', 'のに', 'ので', 'なら', 'たら', 'れば', 'ても', 'でも',
  'かも', 'まで', 'だけ', 'ほど', 'くらい', 'ぐらい', 'など', 'なんか', 'なんて'
]);

export const AUXILIARY_VERBS = new Set([
  'です', 'だ', 'である', 'ます', 'ました', 'ません', 'ませんでした',
  'だっ', 'だった', 'でし', 'でした', 'だろう', 'でしょう',
  'ます', 'ません', 'ました', 'ませんでした', 'ましょう',
  'ない', 'なかった', 'なく', 'なかっ',
  'たい', 'たかった', 'たく', 'たがる',
  'れる', 'られる', 'せる', 'させる',
  'て', 'で', 'た', 'だ',
]);

export const PUNCTUATION = new Set(['。', '、', '！', '？', '…', '―', '「', '」', '『', '』', '（', '）', '・', '.', ',', '!', '?', ':', ';', '"', "'", '(', ')']);

export function kataToHira(text: string): string {
  return [...text].map(ch => {
    const cp = ch.codePointAt(0);
    if (cp === undefined) return ch;
    if (cp >= KATAKANA_START && cp <= KATAKANA_END) {
      return String.fromCodePoint(cp - 0x60);
    }
    return ch;
  }).join('');
}

export function hiraToKata(text: string): string {
  return [...text].map(ch => {
    const cp = ch.codePointAt(0);
    if (cp === undefined) return ch;
    if (cp >= HIRAGANA_START && cp <= HIRAGANA_END) {
      return String.fromCodePoint(cp + 0x60);
    }
    return ch;
  }).join('');
}

export function isKanji(ch: string): boolean {
  const cp = ch.codePointAt(0);
  if (cp === undefined) return false;
  return (
    (0x4E00 <= cp && cp <= 0x9FFF) ||
    (0x3400 <= cp && cp <= 0x4DBF) ||
    (0x20000 <= cp && cp <= 0x2A6DF) ||
    (0xF900 <= cp && cp <= 0xFAFF) ||
    (0x2F800 <= cp && cp <= 0x2FA1F)
  );
}

export function isHiragana(ch: string): boolean {
  const cp = ch.codePointAt(0);
  if (cp === undefined) return false;
  return HIRAGANA_START <= cp && cp <= HIRAGANA_END;
}

export function isKatakana(ch: string): boolean {
  const cp = ch.codePointAt(0);
  if (cp === undefined) return false;
  return KATAKANA_START <= cp && cp <= 0x30FF;
}

export function isKana(ch: string): boolean {
  return isHiragana(ch) || isKatakana(ch);
}

export function containsKanji(text: string): boolean {
  return [...text].some(isKanji);
}

export function containsOnlyKana(text: string): boolean {
  if (!text) return false;
  return [...text].every(c => isKana(c) || c.trim() === '');
}

export function stripSpaces(text: string): string {
  return text.replace(/\s+/g, '');
}

/**
 * Extract the hiragana reading for a token when available.
 * For kuromoji tokens, reading is typically katakana — we convert to hiragana.
 */
export function normalizeReading(reading: string | undefined): string | undefined {
  if (!reading || reading === '*') return undefined;
  // Kuromoji returns katakana reading, convert to hiragana for Mochi furigana
  return kataToHira(reading);
}

/**
 * Determine if a token should be considered a content word (primary clickable)
 * vs particle/auxiliary (secondary greyed)
 */
export function isContentWordHeuristic(surface: string, posHint?: string): boolean {
  if (!surface) return false;
  if (PUNCTUATION.has(surface)) return false;
  if (PARTICLES.has(surface)) return false;
  
  // Single-character particles are low priority
  if (surface.length === 1 && PARTICLES.has(surface)) return false;
  
  // Check if it's purely hiragana single char (likely particle)
  if (surface.length === 1 && isHiragana(surface)) {
    // Keep some hiragana as content (like これ, それ)
    return !PARTICLES.has(surface);
  }
  
  // POS hint from kuromoji if available
  if (posHint) {
    // 名詞, 動詞, 形容詞, 副詞, etc are content
    if (['名詞', '動詞', '形容詞', '副詞', '形容動詞'].some(p => posHint.startsWith(p))) {
      return true;
    }
    if (['助詞', '助動詞', '記号', '接続詞'].some(p => posHint.startsWith(p))) {
      return false;
    }
  }
  
  // Contains kanji -> likely content word
  if (containsKanji(surface)) return true;
  
  // Katakana words (loan words) -> content
  if ([...surface].every(isKatakana)) return true;
  
  // 2+ hiragana characters -> likely content
  if (surface.length >= 2) return true;
  
  return true;
}
