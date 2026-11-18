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

// Book Page mode: one photographed/pasted page being edited into a card
export interface BookPassage {
  id: string;
  name: string;
  /** Current passage text (Markdown, with {{N::...}} clozes applied) */
  text: string;
  /** The untouched full transcription, for "Reset to full transcription" */
  originalText: string;
  imageUrl?: string;
  status: 'transcribing' | 'ready' | 'error';
  /** True when the on-device Tesseract fallback produced the text */
  usedFallbackTranscription?: boolean;
  /** Which transcription provider produced the text (anthropic/openai/tesseract) */
  transcriptionProvider?: string;
  error?: string;
}
