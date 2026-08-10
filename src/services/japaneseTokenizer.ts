/**
 * Japanese Tokenizer Service
 * 
 * Tiered approach:
 *  1. Intl.Segmenter — instant, native browser, zero bundle cost, 95% good for clickability
 *  2. Kuromoji (optional enhancement) — loaded lazily from CDN, provides POS + reading for furigana
 * 
 * This solves the main pain: Japanese users can now CLICK words like Spanish version,
 * instead of dragging to select characters.
 */

import { containsKanji, isContentWordHeuristic, kataToHira, normalizeReading, PARTICLES, PUNCTUATION } from '../utils/kana';

export interface Token {
  surface: string;           // e.g., "食べ物"
  reading?: string;          // katakana from kuromoji, e.g., "タベモノ"
  readingHiragana?: string;  // hiragana, e.g., "たべもの"
  pos?: string;              // Part of speech, e.g., "名詞"
  posDetail1?: string;
  posDetail2?: string;
  isContentWord: boolean;    // Primary clickable (noun, verb, adj, adv)
  isParticle: boolean;
  isPunctuation: boolean;
  isAuxiliary: boolean;
  containsKanji: boolean;
  index: number;             // Position in original text
  start: number;             // Char start offset
  end: number;               // Char end offset
}

// Singleton kuromoji tokenizer — lazy loaded
let kuromojiTokenizerPromise: Promise<any> | null = null;
let kuromojiAvailable: boolean | null = null;

/**
 * Try to load kuromoji from CDN. Falls back gracefully if offline.
 * Uses jsdelivr CDN for dict files to avoid bundling 20MB.
 */
async function loadKuromojiTokenizer(): Promise<any> {
  if (kuromojiTokenizerPromise) return kuromojiTokenizerPromise;

  kuromojiTokenizerPromise = new Promise((resolve, reject) => {
    // If we've previously determined kuromoji is unavailable, reject quickly
    if (kuromojiAvailable === false) {
      reject(new Error('Kuromoji previously failed'));
      return;
    }

    // Check if global kuromoji exists (already loaded)
    if ((window as any).kuromoji) {
      (window as any).kuromoji.builder({
        dicPath: 'https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/'
      }).build((err: any, tokenizer: any) => {
        if (err) {
          kuromojiAvailable = false;
          reject(err);
        } else {
          kuromojiAvailable = true;
          resolve(tokenizer);
        }
      });
      return;
    }

    // Dynamically load kuromoji script from CDN
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/build/kuromoji.js';
    script.async = true;
    script.onload = () => {
      if (!(window as any).kuromoji) {
        kuromojiAvailable = false;
        reject(new Error('Kuromoji global not found after load'));
        return;
      }
      (window as any).kuromoji.builder({
        dicPath: 'https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/'
      }).build((err: any, tokenizer: any) => {
        if (err) {
          kuromojiAvailable = false;
          reject(err);
        } else {
          kuromojiAvailable = true;
          resolve(tokenizer);
        }
      });
    };
    script.onerror = () => {
      kuromojiAvailable = false;
      reject(new Error('Failed to load kuromoji script'));
    };
    document.head.appendChild(script);
  });

  return kuromojiTokenizerPromise;
}

/**
 * Tokenize using browser native Intl.Segmenter
 * Works in Chrome 87+, Safari 14.1+, Edge 87+
 * For Android Chrome — perfect fit per user's primary platform
 */
export function tokenizeWithIntl(text: string, locale: string = 'ja'): Token[] {
  if (!text?.trim()) return [];

  // Fallback if Intl.Segmenter not available (old browsers)
  if (typeof Intl === 'undefined' || !(Intl as any).Segmenter) {
    return fallbackSimpleTokenize(text);
  }

  try {
    const segmenter = new (Intl as any).Segmenter(locale, { granularity: 'word' });
    const segments = segmenter.segment(text);
    
    const tokens: Token[] = [];
    let idx = 0;

    for (const seg of segments) {
      const surface = seg.segment as string;
      if (!surface || surface.trim() === '') continue;

      // Skip whitespace segments but keep them for offset tracking
      const isSpace = /^\s+$/.test(surface);
      if (isSpace) continue;

      const start = seg.index as number;
      const end = start + surface.length;
      const isPunct = PUNCTUATION.has(surface) || /^[\s。、！？「」『』（）・…―\.\,\!\?\:\;\"\'\(\)\[\]]+$/.test(surface);
      const isParticle = PARTICLES.has(surface) || (surface.length === 1 && PARTICLES.has(surface));

      tokens.push({
        surface,
        pos: isPunct ? '記号' : isParticle ? '助詞' : undefined,
        isContentWord: !isPunct && isContentWordHeuristic(surface),
        isParticle,
        isPunctuation: isPunct,
        isAuxiliary: false,
        containsKanji: containsKanji(surface),
        index: idx++,
        start,
        end,
      });
    }

    return tokens;
  } catch (e) {
    console.warn('Intl.Segmenter failed, using fallback:', e);
    return fallbackSimpleTokenize(text);
  }
}

/**
 * Very simple fallback: split by punctuation and heuristic boundaries
 * Better than nothing for old browsers
 */
function fallbackSimpleTokenize(text: string): Token[] {
  // For Japanese, even simple char grouping is better than no tokenization
  // We'll group by script type changes
  const tokens: Token[] = [];
  let current = '';
  let start = 0;
  let idx = 0;

  const flush = () => {
    if (current) {
      const surface = current;
      tokens.push({
        surface,
        isContentWord: isContentWordHeuristic(surface),
        isParticle: PARTICLES.has(surface),
        isPunctuation: PUNCTUATION.has(surface),
        isAuxiliary: false,
        containsKanji: containsKanji(surface),
        index: idx++,
        start,
        end: start + surface.length,
      });
      current = '';
    }
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (PUNCTUATION.has(ch) || /\s/.test(ch)) {
      flush();
      if (!/\s/.test(ch)) {
        tokens.push({
          surface: ch,
          isContentWord: false,
          isParticle: false,
          isPunctuation: true,
          isAuxiliary: false,
          containsKanji: false,
          index: idx++,
          start: i,
          end: i + 1,
        });
      }
      start = i + 1;
    } else {
      if (current === '') start = i;
      current += ch;
      // Heuristic: break on particle boundaries for better UX
      if (PARTICLES.has(ch) && current.length > 1) {
        const prev = current.slice(0, -1);
        if (prev) {
          tokens.push({
            surface: prev,
            isContentWord: isContentWordHeuristic(prev),
            isParticle: false,
            isPunctuation: false,
            isAuxiliary: false,
            containsKanji: containsKanji(prev),
            index: idx++,
            start,
            end: start + prev.length,
          });
        }
        tokens.push({
          surface: ch,
          isContentWord: false,
          isParticle: true,
          isPunctuation: false,
          isAuxiliary: false,
          containsKanji: false,
          index: idx++,
          start: start + prev.length,
          end: start + prev.length + 1,
        });
        current = '';
        start = i + 1;
      }
    }
  }
  flush();
  return tokens;
}

/**
 * Tokenize with kuromoji — provides POS + reading for furigana auto-generation
 * This is the gold standard for Japanese, similar to MeCab you use in Python
 */
export async function tokenizeWithKuromoji(text: string): Promise<Token[]> {
  try {
    const tokenizer = await loadKuromojiTokenizer();
    const kuromojiTokens = tokenizer.tokenize(text);

    return kuromojiTokens.map((t: any, idx: number) => {
      const surface: string = t.surface_form;
      const reading: string | undefined = t.reading && t.reading !== '*' ? t.reading : undefined;
      const pos: string = t.pos || '';
      
      const isPunct = pos === '記号' || PUNCTUATION.has(surface);
      const isParticle = pos === '助詞' || PARTICLES.has(surface);
      const isAux = pos === '助動詞';

      return {
        surface,
        reading,
        readingHiragana: normalizeReading(reading),
        pos,
        posDetail1: t.pos_detail_1,
        posDetail2: t.pos_detail_2,
        isContentWord: !isPunct && !isParticle && !isAux && isContentWordHeuristic(surface, pos),
        isParticle,
        isPunctuation: isPunct,
        isAuxiliary: isAux,
        containsKanji: containsKanji(surface),
        index: idx,
        start: -1, // kuromoji doesn't provide offsets easily, compute approximate
        end: -1,
      } as Token;
    });
  } catch (e) {
    console.warn('Kuromoji tokenization failed, falling back to Intl.Segmenter:', e);
    return tokenizeWithIntl(text, 'ja');
  }
}

/**
 * Main entry point — tries kuromoji if available (for furigana), falls back to Intl
 * For best UX: use Intl immediately for instant clickability, then enhance with kuromoji
 */
export async function tokenizeJapanese(text: string, options: {
  preferKuromoji?: boolean;
  enableCache?: boolean;
} = {}): Promise<Token[]> {
  const { preferKuromoji = true } = options;

  if (preferKuromoji) {
    try {
      // Try kuromoji with timeout — if it takes too long, fallback quickly for mobile UX
      const kuromojiPromise = tokenizeWithKuromoji(text);
      const timeoutPromise = new Promise<Token[]>((_, reject) => 
        setTimeout(() => reject(new Error('timeout')), 3000)
      );
      
      const result = await Promise.race([kuromojiPromise, timeoutPromise]).catch(() => null);
      if (result && result.length > 0) {
        return result;
      }
    } catch {
      // Fall through to Intl
    }
  }

  return tokenizeWithIntl(text, 'ja');
}

/**
 * Synchronous version — instantly returns Intl.Segmenter tokens
 * Use this for immediate UI responsiveness, then optionally upgrade with kuromoji
 */
export function tokenizeJapaneseSync(text: string): Token[] {
  return tokenizeWithIntl(text, 'ja');
}

/**
 * Check if kuromoji is ready (for UI indicators)
 */
export function isKuromojiReady(): boolean {
  return kuromojiAvailable === true;
}

/**
 * For furigana: get reading for a surface form
 * If token already has reading, use it; otherwise undefined
 */
export function getFuriganaForToken(token: Token): string | undefined {
  if (!token.containsKanji) return undefined;
  return token.readingHiragana || (token.reading ? kataToHira(token.reading) : undefined);
}
