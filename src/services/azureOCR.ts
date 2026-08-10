import { createWorker, Worker } from 'tesseract.js';
import { OCRResult } from '../types';
import { getLanguageProfile } from './languageRegistry';

/**
 * Enhanced OCR Service
 * 
 * Improvements over original:
 *  - Worker singleton cache (was creating + terminating per image — slow)
 *  - Image preprocessing: greyscale, contrast boost, 2x upscale for better Tesseract
 *  - PSM 6 (single uniform block) for Duolingo sentence layout
 *  - Dual language: e.g., spa+eng to improve English translation OCR
 *  - Attempt to strip Duolingo UI clutter via canvas cropping attempt
 *  - Optional cloud OCR path via Netlify function (if env VITE_OCR_PROVIDER=cloud)
 */

type LanguageCode = string;

let workerCache: Map<string, Worker> = new Map();
let workerLoading: Map<string, Promise<Worker>> = new Map();

async function getWorker(lang: string): Promise<Worker> {
  const cacheKey = lang;

  if (workerCache.has(cacheKey)) {
    return workerCache.get(cacheKey)!;
  }

  if (workerLoading.has(cacheKey)) {
    return workerLoading.get(cacheKey)!;
  }

  const loadPromise = (async () => {
    const worker = await createWorker(lang, 1, {
      logger: m => {
        // Uncomment for debug
        // console.log(`OCR ${lang}:`, m);
      }
    });

    // Set PSM for Duolingo layout: PSM 6 = Assume uniform block of text (good for sentences)
    // Also try to set other params for better accuracy
    await worker.setParameters({
      // @ts-ignore - tesseract.js param types incomplete
      tessedit_pageseg_mode: '6',
      preserve_interword_spaces: '1',
    } as any);

    workerCache.set(cacheKey, worker);
    workerLoading.delete(cacheKey);
    return worker;
  })();

  workerLoading.set(cacheKey, loadPromise);
  return loadPromise;
}

export async function terminateAllWorkers() {
  for (const [key, worker] of workerCache.entries()) {
    try {
      await worker.terminate();
    } catch {}
  }
  workerCache.clear();
  workerLoading.clear();
}

/**
 * Preprocess image via canvas for better OCR
 * - Convert to greyscale
 * - Increase contrast
 * - Upscale 2x
 * - Attempt to crop to content area (remove Duolingo green header/footer)
 */
async function preprocessImage(imageUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(imageUrl);
          return;
        }

        // Original dims
        let w = img.width;
        let h = img.height;

        // Heuristic: Duolingo screenshots have green header (~15%) and bottom nav (~10%)
        // Try to crop middle 75% where text bubbles are, to remove icons that confuse Tesseract
        // But only if image is tall (screenshot). If already cropped, don't.
        let cropTop = 0;
        let cropHeight = h;
        let cropLeft = 0;
        let cropWidth = w;

        // If height > width * 1.2, likely full phone screenshot
        if (h > w * 1.2) {
          // Crop top 12% and bottom 20% to remove Duolingo UI chrome
          cropTop = Math.floor(h * 0.12);
          cropHeight = Math.floor(h * 0.70);
        }

        // Upscale 2x for better OCR (especially Japanese)
        const scale = 2;
        canvas.width = cropWidth * scale;
        canvas.height = cropHeight * scale;

        // Fill white background (Duolingo bubbles are white on slightly gray)
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.drawImage(
          img,
          cropLeft, cropTop, cropWidth, cropHeight,
          0, 0, canvas.width, canvas.height
        );

        // Get image data for processing
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Greyscale + contrast boost
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          
          // Luminosity greyscale
          let gray = 0.299 * r + 0.587 * g + 0.114 * b;

          // Increase contrast: push towards black or white
          // Duolingo text is dark on light background
          if (gray > 180) {
            // Light background -> white
            gray = Math.min(255, gray + 20);
          } else if (gray < 120) {
            // Dark text -> blacker
            gray = Math.max(0, gray - 30);
          }

          data[i] = gray;
          data[i + 1] = gray;
          data[i + 2] = gray;
        }

        ctx.putImageData(imageData, 0, 0);

        // Return as data URL (PNG for quality)
        const processedUrl = canvas.toDataURL('image/png');
        resolve(processedUrl);
      } catch (e) {
        console.warn('Image preprocessing failed, using original:', e);
        resolve(imageUrl);
      }
    };

    img.onerror = () => {
      resolve(imageUrl);
    };

    img.src = imageUrl;
  });
}

/**
 * Main OCR function — now with preprocessing and worker cache
 * Supports extended languages via language registry
 */
export const processImageWithTesseractOCR = async (
  imageUrl: string,
  language: string
): Promise<OCRResult[]> => {
  try {
    // Check if cloud OCR is enabled via env
    const ocrProvider = (import.meta as any).env?.VITE_OCR_PROVIDER;
    if (ocrProvider === 'cloud') {
      try {
        const cloudResult = await processWithCloudOCR(imageUrl, language);
        if (cloudResult && cloudResult.length > 0) {
          return cloudResult;
        }
        console.warn('Cloud OCR returned empty, falling back to Tesseract');
      } catch (cloudErr) {
        console.warn('Cloud OCR failed, falling back to Tesseract:', cloudErr);
      }
    }

    // Preprocess image for better accuracy
    const processedImageUrl = await preprocessImage(imageUrl);

    // Determine Tesseract languages — use dual lang for better accuracy
    const profile = getLanguageProfile(language);
    let tesseractLang = language;

    // Map to tesseract lang codes and combine with eng for better translation OCR
    const langMap: Record<string, string> = {
      spa: 'spa+eng',
      jpn: 'jpn+eng',
      zho: 'chi_sim+eng',
      fra: 'fra+eng',
      deu: 'deu+eng',
      eng: 'eng',
      tha: 'tha+eng',
      ara: 'ara+eng',
    };

    tesseractLang = langMap[language] || `${language}+eng`;
    
    // For Japanese vertical text support as well
    if (language === 'jpn') {
      // Try jpn first, includes both vertical and horizontal
      tesseractLang = 'jpn+eng';
    }

    const worker = await getWorker(tesseractLang);

    // Process image
    const { data: { lines } } = await worker.recognize(processedImageUrl);

    const ocrResults: OCRResult[] = lines
      .filter(line => line.text && line.text.trim().length > 0)
      // Filter out very low confidence noise (Duolingo UI elements often low conf)
      .filter(line => line.confidence > 30)
      .map(line => ({
        text: line.text,
        confidence: line.confidence / 100,
        boundingBox: Array.isArray(line.bbox) ? (line.bbox as any).map((coord: any) => coord) : [],
      }));

    // Don't terminate worker — keep cached for next image (big speed win)
    return ocrResults;
  } catch (error) {
    console.error('Error processing image with Tesseract OCR:', error);
    throw error;
  }
};

/**
 * Cloud OCR via Netlify Function (optional)
 * Expects endpoint at /.netlify/functions/ocr that proxies to Google Vision / OpenAI Vision
 * This keeps API keys secret and allows better accuracy for complex screenshots
 */
async function processWithCloudOCR(imageUrl: string, language: string): Promise<OCRResult[]> {
  // Convert imageUrl to base64 if it's a blob URL
  let base64Data: string;
  
  if (imageUrl.startsWith('blob:')) {
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    base64Data = await blobToBase64(blob);
  } else if (imageUrl.startsWith('data:')) {
    base64Data = imageUrl;
  } else {
    // Fetch and convert
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    base64Data = await blobToBase64(blob);
  }

  const res = await fetch('/.netlify/functions/ocr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: base64Data,
      language,
      // Hint for Duolingo layout parsing
      prompt: 'Extract Duolingo source sentence and English translation. Ignore UI chrome like streak, hearts, profile icons.',
    }),
  });

  if (!res.ok) {
    throw new Error(`Cloud OCR failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  
  // Expected format: { lines: [{text, confidence}] } or { sourceText, translationText }
  if (data.lines) {
    return data.lines;
  }

  if (data.sourceText || data.translationText) {
    const combined = `${data.sourceText || ''}\n${data.translationText || ''}`;
    return [{
      text: combined,
      confidence: 0.95,
      boundingBox: [],
    }];
  }

  return [];
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(reader.result as string);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Clean up workers on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    terminateAllWorkers();
  });
}
