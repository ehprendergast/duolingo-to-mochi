import type { Token } from '../services/japaneseTokenizer';

export interface OCRResult {
  text: string;
  boundingBox?: number[];
  confidence?: number;
}

export type SupportedLanguage = 'spa' | 'jpn' | 'zho' | 'fra' | 'deu' | 'eng' | string;

export interface ProcessedTextPair {
  id: string;
  sourceText: string;
  translationText: string;
  sourceSelections: string[];
  translationSelections: string[];
  imageUrl?: string;
  sourceLanguage: SupportedLanguage;
  // New: token metadata for furigana/pinyin enrichment
  sourceTokens?: Token[];
  translationTokens?: Token[];
  // Toggle for auto furigana
  autoFurigana?: boolean;
}

export interface ImageProcessingResult {
  id: string;
  imageUrl: string;
  ocrResult: OCRResult[];
  processedPair?: ProcessedTextPair;
  isProcessing: boolean;
  error?: string;
}

// For selection details when furigana enabled
export interface EnrichedSelection {
  surface: string;
  index: number;
  reading?: string; // hiragana for Japanese, pinyin for Chinese
  containsKanji: boolean;
}
