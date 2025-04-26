import { createWorker } from 'tesseract.js';
import { OCRResult } from '../types';

/**
 * Process an image using Tesseract.js OCR
 */
export const processImageWithTesseractOCR = async (imageUrl: string, language: 'eng' | 'spa' | 'jpn'): Promise<OCRResult[]> => {
  try {
    const worker = await createWorker(language);
    
    // Process the image
    const { data: { lines } } = await worker.recognize(imageUrl);
    
    // Convert Tesseract results to our OCR format
    const ocrResults: OCRResult[] = lines.map(line => ({
      text: line.text,
      confidence: line.confidence / 100, // Convert confidence to 0-1 scale
      boundingBox: Array.isArray(line.bbox) ? line.bbox.map(coord => coord) : [] // Safely handle bbox mapping
    }));
    
    await worker.terminate();
    
    return ocrResults;
  } catch (error) {
    console.error('Error processing image with Tesseract OCR:', error);
    throw error;
  }
};