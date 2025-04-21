export interface OCRResult {
  text: string;
  boundingBox?: number[];
  confidence?: number;
}

export interface ProcessedTextPair {
  id: string;
  sourceText: string;
  translationText: string;
  sourceSelections: string[];
  translationSelections: string[];
  imageUrl?: string;
  sourceLanguage: 'spa' | 'jpn';
}

export interface ImageProcessingResult {
  id: string;
  imageUrl: string;
  ocrResult: OCRResult[];
  processedPair?: ProcessedTextPair;
  isProcessing: boolean;
  error?: string;
}