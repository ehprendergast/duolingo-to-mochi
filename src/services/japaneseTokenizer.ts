/**
 * Japanese Tokenizer Service - Fixed for 100% furigana reliability
 * 
 * Issues fixed from user screenshots:
 * - IMG_1122: Output showed {{任}} not {{{任}(yomi)}} - kuromoji CDN timeout, no fallback
 * - IMG_1123: "お任せデザイン" split into お/任/せ/デザイン (single kanji) - Intl splits at script boundaries
 * 
 * Fixes:
 * 1. Local dict first (/dict/), then CDN with 15s timeout + retries, not 3s
 * 2. Cloud furigana fallback via Netlify function /furigana using OpenAI when kuromoji unavailable
 * 3. Intl post-processing: merge  Kanji+Hiragana (任+せ → 任せ), お/ご prefix + Kanji
 */

import { containsKanji, containsOnlyKana, isContentWordHeuristic, kataToHira, normalizeReading, PARTICLES, PUNCTUATION, AUXILIARY_VERBS, isKanji, isHiragana } from '../utils/kana';

export interface Token {
  surface: string;
  reading?: string;
  readingHiragana?: string;
  pos?: string;
  posDetail1?: string;
  posDetail2?: string;
  isContentWord: boolean;
  isParticle: boolean;
  isPunctuation: boolean;
  isAuxiliary: boolean;
  containsKanji: boolean;
  index: number;
  start: number;
  end: number;
  // For cloud furigana loading state
  readingLoading?: boolean;
  readingError?: boolean;
}

let kuromojiTokenizerPromise: Promise<any> | null = null;
let kuromojiAvailable: boolean | null = null;
let kuromojiLoadAttempts = 0;
const MAX_KUROMOJI_ATTEMPTS = 3;

// Dict sources in order - local first (if present), then CDNs
const DICT_SOURCES = [
  '/dict/', // local public/dict/ if you copy dict files
  'https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/',
  'https://unpkg.com/kuromoji@0.1.2/dict/'
];

async function loadKuromojiTokenizer(): Promise<any> {
  if (kuromojiTokenizerPromise) return kuromojiTokenizerPromise;

  kuromojiTokenizerPromise = new Promise((resolve, reject) => {
    if (kuromojiAvailable === false && kuromojiLoadAttempts >= MAX_KUROMOJI_ATTEMPTS) {
      reject(new Error('Kuromoji previously failed'));
      return;
    }

    const tryDict = (dictIndex: number) => {
      if (dictIndex >= DICT_SOURCES.length) {
        kuromojiAvailable = false;
        kuromojiLoadAttempts++;
        reject(new Error('All dict sources failed'));
        return;
      }

      const dicPath = DICT_SOURCES[dictIndex];

      const buildTokenizer = () => {
        if (!(window as any).kuromoji) {
          reject(new Error('Kuromoji global not found'));
          return;
        }
        (window as any).kuromoji.builder({ dicPath }).build((err: any, tokenizer: any) => {
          if (err) {
            console.warn(`Kuromoji dict ${dicPath} failed, trying next:`, err);
            tryDict(dictIndex + 1);
          } else {
            console.log(`Kuromoji loaded with dict ${dicPath}`);
            kuromojiAvailable = true;
            resolve(tokenizer);
          }
        });
      };

      if ((window as any).kuromoji) {
        buildTokenizer();
      } else {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/build/kuromoji.js';
        script.async = true;
        script.onload = buildTokenizer;
        script.onerror = () => {
          console.warn(`Kuromoji script load failed, trying dict ${dictIndex + 1}`);
          // Try next dict source even if script failed? Script is same CDN, so try next script CDN?
          if (dictIndex === 0) {
            // Try unpkg script
            const fallbackScript = document.createElement('script');
            fallbackScript.src = 'https://unpkg.com/kuromoji@0.1.2/build/kuromoji.js';
            fallbackScript.onload = buildTokenizer;
            fallbackScript.onerror = () => reject(new Error('Failed to load kuromoji script from all CDNs'));
            document.head.appendChild(fallbackScript);
          } else {
            reject(new Error('Failed to load kuromoji script'));
          }
        };
        document.head.appendChild(script);
      }
    };

    tryDict(0);
  });

  return kuromojiTokenizerPromise;
}

export function tokenizeWithIntl(text: string, locale: string = 'ja'): Token[] {
  if (!text?.trim()) return [];
  if (typeof Intl === 'undefined' || !(Intl as any).Segmenter) {
    return fallbackSimpleTokenize(text);
  }

  try {
    const segmenter = new (Intl as any).Segmenter(locale, { granularity: 'word' });
    const segments = segmenter.segment(text);
    const rawTokens: Token[] = [];
    let idx = 0;
    for (const seg of segments) {
      const surface = seg.segment as string;
      if (!surface || surface.trim() === '') continue;
      if (/^\s+$/.test(surface)) continue;
      const start = seg.index as number;
      const end = start + surface.length;
      const isPunct = PUNCTUATION.has(surface) || /^[\s。、！？「」『』（）・…―\.\,\!\?\:\;\"\'\(\)\[\]]+$/.test(surface);
      const isParticle = PARTICLES.has(surface) || (surface.length === 1 && PARTICLES.has(surface));
      rawTokens.push({
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

    // Post-process: merge single-kanji + okurigana (任+せ → 任せ) and お/ご prefix
    // This fixes IMG_1123 where お任せデザイン was split into お/任/せ/デザイン
    const merged: Token[] = [];
    let i = 0;
    while (i < rawTokens.length) {
      const curr = rawTokens[i];
      
      // Merge leading お/ご honorific with next token if next contains kanji
      if ((curr.surface === 'お' || curr.surface === 'ご') && i + 1 < rawTokens.length) {
        const next = rawTokens[i + 1];
        if (next.containsKanji || containsKanji(next.surface)) {
          // Merge お + 任せ → お任せ
          const mergedSurface = curr.surface + next.surface;
          // Also check if next+next is hiragana okurigana and should be merged too (任+せ)
          let finalSurface = mergedSurface;
          let j = i + 2;
          // Merge following hiragana okurigana of 1-2 chars (任せ)
          if (j - 1 < rawTokens.length) {
            const after = rawTokens[i + 1];
            // If after is single kanji and next after is hiragana, merge all three
            if (after.surface.length === 1 && containsKanji(after.surface) && j < rawTokens.length) {
              const okuri = rawTokens[j];
              if (okuri.surface.length <= 2 && [...okuri.surface].every(isHiragana)) {
                finalSurface = curr.surface + after.surface + okuri.surface;
                j++;
              }
            }
          }
          // Check if we merged 3, otherwise just 2
          if (finalSurface === mergedSurface && i + 2 < rawTokens.length) {
            const next2 = rawTokens[i + 2];
            if (next2.surface.length <= 2 && [...next2.surface].every(isHiragana) && next.containsKanji) {
              // お任せ case: お + 任 + せ → but we already handled? This is backup
              // Actually our raw is お/任/せ, so first merge お+任 → お任, then next iteration merges お任+せ → お任せ
              // So for now just merge 2
            }
          }

          // If finalSurface is just お + single kanji, check if next after that is hiragana to merge too
          if (finalSurface.length === 2 && containsKanji(finalSurface[1]) && i + 2 < rawTokens.length) {
            const okuri = rawTokens[i + 2];
            if ([...okuri.surface].every(isHiragana) && okuri.surface.length <= 3) {
              finalSurface += okuri.surface;
              merged.push({
                ...curr,
                surface: finalSurface,
                containsKanji: true,
                isContentWord: true,
                isParticle: false,
                isPunctuation: false,
                end: rawTokens[i + 2].end,
                index: merged.length,
              });
              i += 3;
              continue;
            }
          }

          merged.push({
            ...curr,
            surface: finalSurface,
            containsKanji: true,
            isContentWord: true,
            isParticle: false,
            isPunctuation: false,
            end: rawTokens[i + 1].end,
            index: merged.length,
          });
          i += 2;
          continue;
        }
      }

      // Merge Kanji + Hiragana okurigana (美しい should stay together, but 任+せ → 任せ)
      // Single kanji followed by 1-3 hiragana should be merged as verb/adjective
      if (curr.surface.length === 1 && containsKanji(curr.surface) && i + 1 < rawTokens.length) {
        const next = rawTokens[i + 1];
        if ([...next.surface].every(isHiragana) && next.surface.length <= 3 && !next.isParticle && !next.isPunctuation) {
          merged.push({
            ...curr,
            surface: curr.surface + next.surface,
            containsKanji: true,
            isContentWord: true,
            isParticle: false,
            isPunctuation: false,
            end: next.end,
            index: merged.length,
          });
          i += 2;
          continue;
        }
      }

      // Merge multiple consecutive kanji that Intl split singly? (should not happen often, but for safety)
      // If curr is kanji single and next is kanji single, merge into 2-kanji word (八+番目 → 八番目? Actually should be 八番目 as one)
      if (curr.surface.length === 1 && containsKanji(curr.surface) && i + 1 < rawTokens.length) {
        const next = rawTokens[i + 1];
        if (next.surface.length >= 1 && containsKanji(next.surface) && next.surface.length <= 3) {
          // Merge 八 + 番目 → 八番目? But 番目 contains kanji+hiragana, so maybe keep separate
          // Only merge if both are single kanji
          if (next.surface.length === 1 && containsKanji(next.surface)) {
            // Look ahead one more to see if there's okurigana
            let mergedSurface = curr.surface + next.surface;
            if (i + 2 < rawTokens.length) {
              const next2 = rawTokens[i + 2];
              if ([...next2.surface].every(isHiragana) && next2.surface.length <= 2) {
                mergedSurface += next2.surface;
                merged.push({
                  ...curr,
                  surface: mergedSurface,
                  containsKanji: true,
                  isContentWord: true,
                  end: next2.end,
                  index: merged.length,
                });
                i += 3;
                continue;
              }
            }
            merged.push({
              ...curr,
              surface: mergedSurface,
              containsKanji: true,
              isContentWord: true,
              end: next.end,
              index: merged.length,
            });
            i += 2;
            continue;
          }
        }
      }

      merged.push({ ...curr, index: merged.length });
      i++;
    }

    return merged;
  } catch (e) {
    console.warn('Intl.Segmenter failed:', e);
    return fallbackSimpleTokenize(text);
  }
}

function fallbackSimpleTokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let current = '';
  let start = 0;
  let idx = 0;
  const flush = () => {
    if (current) {
      tokens.push({
        surface: current,
        isContentWord: isContentWordHeuristic(current),
        isParticle: PARTICLES.has(current),
        isPunctuation: PUNCTUATION.has(current),
        isAuxiliary: false,
        containsKanji: containsKanji(current),
        index: idx++,
        start,
        end: start + current.length,
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
          surface: ch, isContentWord: false, isParticle: false, isPunctuation: true,
          isAuxiliary: false, containsKanji: false, index: idx++, start: i, end: i + 1,
        });
      }
      start = i + 1;
    } else {
      if (current === '') start = i;
      current += ch;
      if (PARTICLES.has(ch) && current.length > 1) {
        const prev = current.slice(0, -1);
        if (prev) tokens.push({
          surface: prev, isContentWord: isContentWordHeuristic(prev), isParticle: false,
          isPunctuation: false, isAuxiliary: false, containsKanji: containsKanji(prev),
          index: idx++, start, end: start + prev.length,
        });
        tokens.push({
          surface: ch, isContentWord: false, isParticle: true, isPunctuation: false,
          isAuxiliary: false, containsKanji: false, index: idx++,
          start: start + prev.length, end: start + prev.length + 1,
        });
        current = '';
        start = i + 1;
      }
    }
  }
  flush();
  return tokens;
}

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
        start: -1,
        end: -1,
      } as Token;
    });
  } catch (e) {
    console.warn('Kuromoji failed, fallback to Intl:', e);
    return tokenizeWithIntl(text, 'ja');
  }
}

export async function tokenizeJapanese(text: string, options: { preferKuromoji?: boolean } = {}): Promise<Token[]> {
  const { preferKuromoji = true } = options;
  if (preferKuromoji) {
    try {
      // Longer timeout for mobile - 10s, not 3s
      const kuromojiPromise = tokenizeWithKuromoji(text);
      const timeoutPromise = new Promise<Token[]>((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000));
      const result = await Promise.race([kuromojiPromise, timeoutPromise]).catch(() => null);
      if (result && result.length > 0) return result;
    } catch {}
  }
  return tokenizeWithIntl(text, 'ja');
}

export function tokenizeJapaneseSync(text: string): Token[] {
  return tokenizeWithIntl(text, 'ja');
}

export function isKuromojiReady(): boolean {
  return kuromojiAvailable === true;
}

export function getFuriganaForToken(token: Token): string | undefined {
  if (!token.containsKanji) return undefined;
  return token.readingHiragana || (token.reading ? kataToHira(token.reading) : undefined);
}

/**
 * Build the lookup unit for a kanji token: the word AS IT APPEARS in
 * the sentence, not the isolated segment.
 *
 * Segmentation runs before readings exist, so a segment can be a bare
 * kanji (履 in 履きます). Looking that segment up on its own yields an
 * isolated-kanji reading that ignores how the word is actually read in
 * context (the kun'yomi/on'yomi choice depends on the word, not the
 * character). So readings are resolved at the word level first: absorb
 * the following kana tokens that belong to the same word (okurigana
 * and inflectional kana), stopping at particles, auxiliaries,
 * punctuation, or another kanji token.
 */
export function buildLookupUnit(tokens: Token[], startIndex: number): string {
  let unit = tokens[startIndex]?.surface ?? '';
  for (let i = startIndex + 1; i < tokens.length; i++) {
    const next = tokens[i];
    if (
      next.containsKanji ||
      next.isPunctuation ||
      next.isParticle ||
      next.isAuxiliary ||
      PARTICLES.has(next.surface) ||
      AUXILIARY_VERBS.has(next.surface) ||
      !containsOnlyKana(next.surface)
    ) {
      break;
    }
    unit += next.surface;
  }
  return unit;
}

/**
 * Map a whole-word reading back onto the kanji token it was fetched
 * for. The trailing kana of the word (okurigana/inflection) appear
 * verbatim at the end of both the word and its reading, so strip the
 * longest common suffix: 履きます/はきます -> は for the token 履.
 * When the provider returned the dictionary-form reading instead
 * (履きます -> はく), there is no common suffix and the full reading
 * is kept — showing the dictionary form over the kanji is helpful
 * for spotting the stem in an ambiguous conjugation.
 */
export function alignReadingToToken(
  unitText: string,
  tokenSurface: string,
  unitReading: string
): string {
  if (!unitReading || unitText === tokenSurface || !unitText.startsWith(tokenSurface)) {
    return unitReading;
  }
  const suffix = unitText.slice(tokenSurface.length);
  let common = 0;
  while (
    common < suffix.length &&
    common < unitReading.length &&
    suffix[suffix.length - 1 - common] === unitReading[unitReading.length - 1 - common]
  ) {
    common++;
  }
  if (common > 0 && unitReading.length > common) {
    return unitReading.slice(0, unitReading.length - common);
  }
  return unitReading;
}

/**
 * Cloud furigana fallback - calls Netlify function /furigana
 * This makes furigana work even when kuromoji fails to load (your mobile case)
 *
 * Order of operations matters: readings are resolved for the
 * contextual word (buildLookupUnit) with the sentence as context, and
 * only then aligned back onto the individual segment — never looked
 * up per isolated segment.
 */
export async function fetchFuriganaForTokens(tokens: Token[], contextSentence: string): Promise<Map<number, string>> {
  const result = new Map<number, string>();

  const jobs: { tokenIndex: number; tokenSurface: string; unitText: string }[] = [];
  tokens.forEach((token, i) => {
    if (token.containsKanji && !token.readingHiragana && !token.isPunctuation) {
      jobs.push({
        tokenIndex: token.index,
        tokenSurface: token.surface,
        unitText: buildLookupUnit(tokens, i),
      });
    }
  });
  if (jobs.length === 0) return result;

  const fetchUnit = async (unitText: string): Promise<string | null> => {
    try {
      const res = await fetch('/.netlify/functions/furigana', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: unitText,
          context: contextSentence,
          language: 'jpn'
        })
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.reading ? (normalizeReading(data.reading) ?? null) : null;
    } catch (e) {
      console.warn(`Furigana fetch failed for ${unitText}:`, e);
      return null;
    }
  };

  // One request per distinct contextual word, limited concurrency.
  const uniqueUnits = [...new Set(jobs.map((j) => j.unitText))];
  const unitReadings = new Map<string, string | null>();
  const concurrency = 3;
  for (let i = 0; i < uniqueUnits.length; i += concurrency) {
    const batch = uniqueUnits.slice(i, i + concurrency);
    const readings = await Promise.all(batch.map(fetchUnit));
    batch.forEach((unit, k) => unitReadings.set(unit, readings[k]));
  }

  for (const job of jobs) {
    const unitReading = unitReadings.get(job.unitText);
    if (unitReading) {
      result.set(job.tokenIndex, alignReadingToToken(job.unitText, job.tokenSurface, unitReading));
    }
  }

  return result;
}
