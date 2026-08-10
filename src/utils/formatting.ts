import { ProcessedTextPair } from '../types';
import { Token } from '../services/japaneseTokenizer';
import { containsKanji } from './kana';
import { getLanguageProfile, isUnspacedLanguage } from '../services/languageRegistry';

/**
 * Formats text pairs according to Mochi import format
 * Adds "# " prefix and separates pairs with -----
 */
export const formatTextPairs = (pairs: ProcessedTextPair[]): string => {
  if (pairs.length === 0) return '';
  
  return pairs
    .map((pair, index) => {
      const formattedSource = formatSourceWithSelections(
        pair.sourceText,
        pair.sourceSelections,
        pair.sourceLanguage,
        pair.sourceTokens,
        pair.autoFurigana
      );
      const formattedTranslation = formatTranslationWithSelections(
        pair.translationText,
        pair.translationSelections,
        pair.sourceLanguage
      );
      
      const pairText = `# ${formattedSource}\n${formattedTranslation}`;
      
      return index === pairs.length - 1 ? pairText : `${pairText}\n-----`;
    })
    .join('\n');
};

/**
 * Parse a selection string of form `${surface}_${index}` into parts
 * Also handles legacy raw selections (for backward compat with drag-select)
 */
function parseTokenSelection(sel: string): { surface: string; index: number | null } {
  // Try to split on last underscore
  const lastUnderscore = sel.lastIndexOf('_');
  if (lastUnderscore === -1) {
    return { surface: sel, index: null };
  }
  const surface = sel.slice(0, lastUnderscore);
  const indexStr = sel.slice(lastUnderscore + 1);
  const index = parseInt(indexStr, 10);
  if (isNaN(index)) {
    // Not a token index format, treat whole string as surface (legacy phrase selection)
    return { surface: sel, index: null };
  }
  return { surface, index };
}

/**
 * Format source text with selections wrapped
 * Supports:
 *  - Spaced languages: {{word}}
 *  - Japanese with auto-furigana: {{{kanji}(reading)}} or {{kana}}
 *  - Chinese with pinyin: {{{hanzi}(pinyin)}} (future)
 */
export const formatSourceWithSelections = (
  text: string,
  selections: string[],
  sourceLanguage: string,
  tokens?: Token[],
  autoFurigana: boolean = true
): string => {
  if (!selections.length) return text;
  
  const profile = getLanguageProfile(sourceLanguage);
  const tokenMap = new Map<number, Token>();
  if (tokens) {
    tokens.forEach(t => tokenMap.set(t.index, t));
  }

  // For unspaced languages with token info
  if (isUnspacedLanguage(sourceLanguage) && tokens && tokens.length > 0) {
    // Create a map of selected indices
    const selectedIndices = new Set<number>();
    const legacyPhrases: string[] = [];

    for (const sel of selections) {
      const parsed = parseTokenSelection(sel);
      if (parsed.index !== null && tokenMap.has(parsed.index)) {
        selectedIndices.add(parsed.index);
      } else {
        // Legacy phrase selection (old drag-select)
        legacyPhrases.push(parsed.surface);
      }
    }

    // Build formatted text by walking tokens and preserving original spacing/punctuation
    let result = '';
    // Since Intl.Segmenter stripped spaces, we need to reconstruct from original text
    // Simpler: rebuild from tokens with selections applied, joining with no space for unspaced
    // But we want to preserve original text's exact form for non-selected parts
    
    // For true reconstruction, we use the original text and token offsets if available
    // Fallback: join selected tokens with cloze markup inline

    // Approach: create array of strings for each token position, with cloze if selected
    const parts: string[] = [];
    for (const token of tokens) {
      if (token.isPunctuation) {
        parts.push(token.surface);
        continue;
      }

      if (selectedIndices.has(token.index)) {
        const reading = token.readingHiragana || 
                       (token.reading ? token.reading : undefined) ||
                       undefined;
        const surface = token.surface;

        // Check if should add furigana
        const shouldAddFurigana = autoFurigana && 
                                 containsKanji(surface) && 
                                 reading && 
                                 reading !== surface &&
                                 profile.supportsFurigana;

        if (shouldAddFurigana) {
          // Mochi format: {{{vocab}(furigana)}}
          parts.push(`{{{${surface}}(${reading})}}`);
        } else {
          parts.push(`{{${surface}}}`);
        }
      } else {
        parts.push(token.surface);
      }
    }

    // Handle legacy phrase selections that didn't map to tokens
    let formattedText = parts.join('');
    if (legacyPhrases.length > 0) {
      const sorted = [...legacyPhrases].sort((a, b) => b.length - a.length);
      for (const phrase of sorted) {
        const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Avoid double-wrapping if already clozed
        if (!formattedText.includes(`{{${phrase}}}`) && !formattedText.includes(`{{{${phrase}}}`)) {
          // Check if contains kanji + we have reading info for whole phrase
          formattedText = formattedText.replace(new RegExp(escaped, 'g'), `{{${phrase}}}`);
        }
      }
    }

    return formattedText.replace(/\| /g, 'I ').trim();
  }

  // Spanish / other spaced languages
  if (!isUnspacedLanguage(sourceLanguage)) {
    // selections are like "word_index"
    const selectedPositions = new Set<number>();
    const rawWordsToSelect = new Set<string>();

    for (const sel of selections) {
      const parsed = parseTokenSelection(sel);
      if (parsed.index !== null) {
        selectedPositions.add(parsed.index);
      } else {
        rawWordsToSelect.add(parsed.surface);
      }
    }

    // Split text into tokens similar to display
    const words = text.match(/[\p{L}\p{N}\p{M}’']+|[^\s\p{L}\p{N}]+|\s+/gu) || [text];
    let wordIdx = 0;
    const formattedParts: string[] = [];

    for (const part of words) {
      if (/^\s+$/.test(part)) {
        formattedParts.push(part);
        continue;
      }
      if (/^[^\p{L}\p{N}]+$/u.test(part)) {
        formattedParts.push(part);
        continue;
      }

      if (selectedPositions.has(wordIdx) || rawWordsToSelect.has(part)) {
        formattedParts.push(`{{${part}}}`);
      } else {
        formattedParts.push(part);
      }
      wordIdx++;
    }

    return formattedParts.join('').replace(/\| /g, 'I ').trim();
  }

  // Fallback legacy Japanese handler (phrase-based)
  {
    const sortedSelections = [...selections].sort((a, b) => b.length - a.length);
    let formattedText = text;
    for (const selection of sortedSelections) {
      const parsed = parseTokenSelection(selection);
      const surface = parsed.surface;
      const escaped = surface.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Try to find token reading if available
      let replacement = `{{${surface}}}`;
      if (autoFurigana && containsKanji(surface) && tokens) {
        const matchingToken = tokens.find(t => t.surface === surface && t.readingHiragana);
        if (matchingToken?.readingHiragana) {
          replacement = `{{{${surface}}(${matchingToken.readingHiragana})}}`;
        }
      }
      formattedText = formattedText.replace(new RegExp(escaped, 'g'), replacement);
    }
    return formattedText.replace(/\| /g, 'I ').trim();
  }
};

/**
 * Format translation text with selections bolded
 */
export const formatTranslationWithSelections = (
  text: string,
  selections: string[],
  sourceLanguage: string
): string => {
  if (!selections.length) return text;
  
  let formattedText = text;
  
  if (!isUnspacedLanguage(sourceLanguage)) {
    const selectedPositions = new Set<number>();
    const rawWords = new Set<string>();

    for (const sel of selections) {
      const parsed = parseTokenSelection(sel);
      if (parsed.index !== null) {
        selectedPositions.add(parsed.index);
      } else {
        rawWords.add(parsed.surface);
      }
    }

    const words = text.match(/[\p{L}\p{N}\p{M}’']+|[^\s\p{L}\p{N}]+|\s+/gu) || [text];
    let wordIdx = 0;
    const formattedParts: string[] = [];

    for (const part of words) {
      if (/^\s+$/.test(part)) {
        formattedParts.push(part);
        continue;
      }
      if (/^[^\p{L}\p{N}]+$/u.test(part)) {
        formattedParts.push(part);
        continue;
      }

      if (selectedPositions.has(wordIdx) || rawWords.has(part)) {
        formattedParts.push(`**${part}**`);
      } else {
        formattedParts.push(part);
      }
      wordIdx++;
    }

    return formattedParts.join('');
  } else {
    // Japanese translation English is still spaced, but source selections were unspaced
    // For translation bolding, selections may still be spaced (English) — handle generically
    const selectedPositions = new Set<number>();
    const phrases: string[] = [];

    for (const sel of selections) {
      const parsed = parseTokenSelection(sel);
      if (parsed.index !== null) {
        selectedPositions.add(parsed.index);
      } else {
        phrases.push(parsed.surface);
      }
    }

    if (selectedPositions.size > 0) {
      // Translation is English (spaced) even if source was Japanese
      const words = text.match(/[\p{L}\p{N}\p{M}’']+|[^\s\p{L}\p{N}]+|\s+/gu) || [text];
      let wordIdx = 0;
      const parts: string[] = [];
      for (const part of words) {
        if (/^\s+$/.test(part) || /^[^\p{L}\p{N}]+$/u.test(part)) {
          parts.push(part);
          if (!/^\s+$/.test(part) && /^[^\p{L}\p{N}]+$/u.test(part)) {
            // punctuation doesn't increment word idx? Actually it does NOT in our tokenization
          } else if (/^\s+$/.test(part)) {
            // spaces don't increment
          }
          if (/^[^\p{L}\p{N}]+$/u.test(part)) continue;
        }
        if (selectedPositions.has(wordIdx)) {
          parts.push(`**${part}**`);
        } else {
          parts.push(part);
        }
        if (!/^\s+$/.test(part) && !/^[^\p{L}\p{N}]+$/u.test(part)) {
          wordIdx++;
        }
      }
      formattedText = parts.join('');
    }

    if (phrases.length > 0) {
      const sorted = [...phrases].sort((a, b) => b.length - a.length);
      for (const phrase of sorted) {
        const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (!formattedText.includes(`**${phrase}**`)) {
          formattedText = formattedText.replace(new RegExp(escaped, 'g'), `**${phrase}**`);
        }
      }
    }
  }
  
  return formattedText;
};

/**
 * Separates the OCR text into source and translation parts
 * Now uses language registry for extensibility
 */
export const separateTextPairs = (text: string, sourceLanguage: string): { sourceText: string; translationText: string } => {
  let sourceText = '';
  let translationText = '';

  const profile = getLanguageProfile(sourceLanguage);

  if (!isUnspacedLanguage(sourceLanguage)) {
    // Spaced languages: Spanish, French, German, etc.
    let normalizedText = text.replace(/\n/g, ' ').trim();
    normalizedText = normalizedText
      .replace(/\s+/g, ' ')
      .replace(/\| /g, 'I '); // Common Tesseract error
    
    const delimiters = [...normalizedText.matchAll(/[.!?]/g)].map(match => match.index);
    
    if (delimiters.length >= 2) {
      if (delimiters.length === 2 || delimiters.length === 3) {
        const firstDelimiterPos = delimiters[0];
        const secondDelimiterPos = delimiters[1];
        
        const textAfterFirstDelimiter = normalizedText.slice(firstDelimiterPos! + 1);
        const firstSpaceAfterDelimiter = textAfterFirstDelimiter.search(/\s/);
        const sourceEndPos = firstDelimiterPos! + firstSpaceAfterDelimiter + 1;
        
        sourceText = normalizedText.slice(0, sourceEndPos).trim();
        translationText = normalizedText.slice(sourceEndPos, secondDelimiterPos! + 1).trim();
      } else {
        const secondDelimiterPos = delimiters[1];
        const fourthDelimiterPos = delimiters[3];
        
        sourceText = normalizedText.slice(0, secondDelimiterPos! + 1).trim();
        translationText = normalizedText.slice(secondDelimiterPos! + 1, fourthDelimiterPos! + 1).trim();
      }
    } else if (normalizedText) {
      // Fallback: try to split by line or assume first sentence is source
      const sentences = normalizedText.split(/(?<=[.!?])\s+/);
      if (sentences.length >= 2) {
        sourceText = sentences[0].trim();
        translationText = sentences.slice(1).join(' ').trim();
      } else {
        // If cannot split, use whole as source (user can edit)
        sourceText = normalizedText;
      }
    }
  } else {
    // Unspaced languages: Japanese, Chinese
    let normalizedText = text.trim();
    
    // Remove first line if it's UI noise (before double newline)
    normalizedText = normalizedText.replace(/^[^\n]*\n\n/, '');
    
    normalizedText = normalizedText
      .replace(/【/g, '')
      .replace(/】/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    normalizedText = normalizedText.replace(/\n/g, ' ').trim();

    // For Japanese: find sentence ending with 。！？!?
    let japanesePattern: RegExp;
    if (sourceLanguage === 'jpn') {
      japanesePattern = /^.*?([^。！？!?]+[。！？!?])/;
    } else {
      // Chinese uses 。？！
      japanesePattern = /^.*?([^。！？!?]+[。！？!?])/;
    }

    const match = normalizedText.match(japanesePattern);

    if (match) {
      sourceText = match[1]
        .replace(/!/g, '！')
        .replace(/\?/g, '？')
        .replace(/\s+/g, '')
        .trim();
      
      const remainingText = normalizedText.slice(match[0].length).trim();
      
      const translationMatch = remainingText.match(/([^.!?]+[.!?])/);
      
      if (translationMatch) {
        translationText = translationMatch[1]
          .replace(/^l/, 'I ')
          .replace(/^1/, 'I ')
          .replace(/^I s/, 'Is')
          .replace(/^I m/, "I'm")
          .replace(/^I n/, 'In')
          .trim();
      } else if (remainingText) {
        // Fallback: take remaining as translation
        translationText = remainingText.split(/[。！？]/)[0]?.trim() || remainingText;
      }

      sourceText = sourceText
        .replace(/^([ぁ-ん])?@/, '')
        .replace(/^([ぁ-ん])?」/, '');
        
    } else {
      // Could not find Japanese sentence pattern — fallback heuristic
      // Split by known Japanese characters vs English
      const jaChars = normalizedText.match(/[一-龯ぁ-んァ-ン。！？、]+/g);
      if (jaChars && jaChars.length > 0) {
        // Longest Japanese segment is likely source
        sourceText = jaChars.reduce((a, b) => a.length > b.length ? a : b, '').trim();
        // Rest is translation — find English sentences
        const afterSource = normalizedText.slice(normalizedText.indexOf(sourceText) + sourceText.length).trim();
        const engMatch = afterSource.match(/[A-Za-z][^。.!?]*[.!?]/);
        translationText = engMatch ? engMatch[0].trim() : afterSource;
      }
    }
  }

  // Clean up English translation OCR errors (contractions)
  if (translationText) {
    translationText = translationText
      .replace(/I\s?m\s/g, "I'm ")
      .replace(/I\s?ll\s/g, "I'll ")
      .replace(/I\s?ve\s/g, "I've ")
      .replace(/I\s?d\s/g, "I'd ")
      .replace(/(?<!\.)\sL/g, ' l')
      .replace(/You\s?re\s/g, "You're ")
      .replace(/You\s?ve\s/g, "You've ")
      .replace(/You\s?ll\s/g, "You'll")
      .replace(/You\s?d\s/g, "You'd ")
      .replace(/\syou\s?re\s/g, " you're ")
      .replace(/\syou\s?ve\s/g, " you've ")
      .replace(/\syou\s?ll\s/g, " you'll ")
      .replace(/\syou\s?d\s/g, " you'd ")
      .replace(/He\s?s\s/g, "He's ")
      .replace(/He\s?d\s/g, "He'd ")
      .replace(/He\s?ll\s/g, "He'll ")
      .replace(/\she\s?s\s/g, " he's ")
      .replace(/\she\s?d\s/g, " he'd ")
      .replace(/\she\s?ll\s/g, " he'll ")
      .replace(/She\s?s\s/g, "She's ")
      .replace(/She\s?d\s/g, "She'd ")
      .replace(/She\s?ll\s/g, "She'll ")
      .replace(/\sshe\s?s\s/g, " she's ")
      .replace(/\sshe\s?d\s/g, " she'd ")
      .replace(/\sshe\s?ll\s/g, " she'll ")
      .replace(/It\s?s\s/g, "It's ")
      .replace(/It\s?ll\s/g, "It'll ")
      .replace(/\sit\s?ll\s/g, " it'll ")
      .replace(/They\s?re\s/g, "They're ")
      .replace(/They\s?ve\s/g, "They've ")
      .replace(/They\s?ll\s/g, "They'll ")
      .replace(/They\s?d\s/g, "They'd ")
      .replace(/\sthey\s?re\s/g, " they're ")
      .replace(/\sthey\s?ve\s/g, " they've ")
      .replace(/\sthey\s?ll\s/g, " they'll ")
      .replace(/\sthey\s?d\s/g, " they'd ")
      .replace(/We\sre\s/g, "We're ")
      .replace(/We\s?ve\s/g, "We've ")
      .replace(/We\s?ll\s/g, "We'll ")
      .replace(/We\s?d\s/g, "We'd ")
      .replace(/\swe\sre\s/g, " we're ")
      .replace(/\swe\s?ve\s/g, " we've ")
      .replace(/\swe\s?ll\s/g, " we'll ")
      .replace(/\swe\s?d\s/g, " we'd ")
      .replace(/Isn\s?t\s/g, "Isn't ")
      .replace(/\sisn\s?t\s/g, " isn't ")
      .replace(/Are\s?nt\s/g, "Aren't ")
      .replace(/\sare\s?nt\s/g, " aren't ")
      .replace(/Was\s?n't\s/g, "Wasn't ")
      .replace(/\swas\s?n't\s/g, " wasn't ")
      .replace(/Were\s?n't\s/g, "Weren't ")
      .replace(/\swere\s?n't\s/g, " weren't ")
      .replace(/Haven\s?t\s/g, "Haven't ")
      .replace(/\shaven\s?t\s/g, " haven't ")
      .replace(/Had\s?n't\s/g, "Hadn't ")
      .replace(/\shad\s?n't\s/g, " hadn't ")
      .replace(/Won\s?t\s/g, "Won't ")
      .replace(/\swon\s?t\s/g, " won't ")
      .replace(/Wouldn\s?t\s/g, "Wouldn't ")
      .replace(/\swouldn\s?t\s/g, " wouldn't ")
      .replace(/Can\s?t\s/g, "Can't ")
      .replace(/\scan\s?t\s/g, " can't ")
      .replace(/Don\s?t\s/g, "Don't ")
      .replace(/\sdon\s?t\s/g, " don't ")
      .replace(/Does\s?n't\s/g, "Doesn't ")
      .replace(/\sdoes\s?n't\s/g, " doesn't ")
      .replace(/Did\s?n't\s/g, "Didn't ")
      .replace(/\sdid\s?n't\s/g, " didn't ")
      .replace(/Could\s?n't\s/g, "Couldn't ")
      .replace(/\scouldn\s?t\s/g, " couldn't ")
      .replace(/Should\s?n't\s/g, "Shouldn't ")
      .replace(/\sshould\s?n't\s/g, " shouldn't ")
      .trim();
  }

  return { sourceText, translationText };
};

export const generateId = (): string => {
  return Math.random().toString(36).substring(2, 11);
};
