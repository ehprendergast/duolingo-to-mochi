/**
 * Generic tokenizer service — dispatches to language-specific tokenizers
 * Unified interface for all Duolingo languages
 */

import { LanguageCode, getLanguageProfile } from './languageRegistry';
import { Token, tokenizeJapanese, tokenizeJapaneseSync, tokenizeWithIntl } from './japaneseTokenizer';
import { containsKanji } from '../utils/kana';

export type { Token } from './japaneseTokenizer';

export interface TokenizerResult {
  tokens: Token[];
  method: 'kuromoji' | 'intl' | 'spaced' | 'fallback';
  language: LanguageCode;
}

/**
 * Tokenize text based on language profile
 */
export async function tokenize(text: string, languageCode: string): Promise<TokenizerResult> {
  const profile = getLanguageProfile(languageCode);
  
  if (profile.code === 'jpn') {
    const tokens = await tokenizeJapanese(text, { preferKuromoji: true });
    return {
      tokens,
      method: tokens.length > 0 && tokens[0].reading ? 'kuromoji' : 'intl',
      language: profile.code,
    };
  }

  if (profile.code === 'zho') {
    const tokens = tokenizeWithIntl(text, 'zh');
    return { tokens, method: 'intl', language: profile.code };
  }

  // Spaced languages — simple split but with proper handling
  return {
    tokens: tokenizeSpacedLanguage(text),
    method: 'spaced',
    language: profile.code as LanguageCode,
  };
}

/**
 * Synchronous fast path — for immediate UI
 */
export function tokenizeSync(text: string, languageCode: string): TokenizerResult {
  const profile = getLanguageProfile(languageCode);

  if (profile.code === 'jpn') {
    const tokens = tokenizeJapaneseSync(text);
    return { tokens, method: 'intl', language: profile.code };
  }

  if (profile.tokenization === 'unspaced') {
    const tokens = tokenizeWithIntl(text, profile.segmenterLocale);
    return { tokens, method: 'intl', language: profile.code };
  }

  return {
    tokens: tokenizeSpacedLanguage(text),
    method: 'spaced',
    language: profile.code as LanguageCode,
  };
}

function tokenizeSpacedLanguage(text: string): Token[] {
  if (!text?.trim()) return [];
  
  const tokens: Token[] = [];
  let idx = 0;
  let charOffset = 0;

  // Split by words while preserving punctuation and spaces
  const words = text.split(/(\s+)/);

  for (const part of words) {
    if (!part) continue;
    if (/^\s+$/.test(part)) {
      charOffset += part.length;
      continue;
    }

    // Further split word from attached punctuation for cleaner UX
    // e.g., "Hola," => ["Hola", ","]
    const subTokens = part.match(/[\p{L}\p{N}\p{M}’'’]+|[^\s\p{L}\p{N}]+/gu) || [part];

    for (const sub of subTokens) {
      if (!sub) continue;
      const isPunct = /^[^\p{L}\p{N}]+$/u.test(sub);
      tokens.push({
        surface: sub,
        isContentWord: !isPunct,
        isParticle: false,
        isPunctuation: isPunct,
        isAuxiliary: false,
        containsKanji: containsKanji(sub),
        index: idx++,
        start: charOffset,
        end: charOffset + sub.length,
      });
      charOffset += sub.length;
    }
  }

  return tokens;
}
