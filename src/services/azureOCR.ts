import { createWorker, Worker } from 'tesseract.js';
import { OCRResult } from '../types';
import { getLanguageProfile } from './languageRegistry';

/**
 * Enhanced OCR Service - Tuned for Duolingo sharing images
 * Based on user's raw screenshots:
 * - 1500x1500 square, speech bubble top 60%, duolingo logo bottom-left + character bottom-right
 * - Also supports tall phone screenshots (previous logic)
 */

let workerCache: Map<string, Worker> = new Map();
let workerLoading: Map<string, Promise<Worker>> = new Map();

async function getWorker(lang: string): Promise<Worker> {
  const cacheKey = lang;
  if (workerCache.has(cacheKey)) return workerCache.get(cacheKey)!;
  if (workerLoading.has(cacheKey)) return workerLoading.get(cacheKey)!;

  const loadPromise = (async () => {
    const worker = await createWorker(lang, 1, {
      logger: _ => {}
    });
    await worker.setParameters({
      // @ts-ignore
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
  for (const worker of workerCache.values()) {
    try { await worker.terminate(); } catch {}
  }
  workerCache.clear();
  workerLoading.clear();
}

/**
 * Preprocess tuned for Duolingo sharing images (your 2 PNGs)
 * - 1500x1500 square: bubble is top ~62%, bottom 38% is logo+character → crop it
 * - Tall phone screenshots: also crop green header + bottom nav
 * - Always: greyscale + contrast boost + 2x upscale
 */
async function preprocessImage(imageUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(imageUrl); return; }

        let w = img.width;
        let h = img.height;

        let cropTop = 0;
        let cropLeft = 0;
        let cropWidth = w;
        let cropHeight = h;

        // Detect image type and apply appropriate crop
        const isSquare = Math.abs(w - h) < w * 0.15; // ~square like your 1500x1500 sharing images
        const isTall = h > w * 1.2;

        if (isSquare) {
          // Your screenshots: 1500x1500, bubble top 60%, logo+character bottom 38%
          // Crop top 5% (grey margin) and bottom 38%
          cropTop = Math.floor(h * 0.05);
          cropHeight = Math.floor(h * 0.58); // keep top 58% after top crop → removes logo+character
          cropLeft = Math.floor(w * 0.05);
          cropWidth = Math.floor(w * 0.90); // slight side crop to remove bubble border
        } else if (isTall) {
          // Full phone screenshot: green header ~12% top, bottom nav ~20%
          cropTop = Math.floor(h * 0.12);
          cropHeight = Math.floor(h * 0.70);
        } else {
          // Generic wide image: light crop
          cropTop = Math.floor(h * 0.03);
          cropHeight = Math.floor(h * 0.92);
        }

        const scale = 2;
        canvas.width = cropWidth * scale;
        canvas.height = cropHeight * scale;

        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.drawImage(img, cropLeft, cropTop, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);

        // Greyscale + high contrast - Duolingo text is dark gray #4B4B4B on white
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i+1], b = data[i+2];
          let gray = 0.299 * r + 0.587 * g + 0.114 * b;

          // Stronger contrast for Duolingo's gray text
          if (gray > 185) {
            gray = 255; // background to pure white
          } else if (gray < 90) {
            gray = 0; // text to black
          } else if (gray < 140) {
            gray = Math.max(0, gray - 60); // dark gray → black
          } else {
            gray = Math.min(255, gray + 50); // light gray → white
          }

          data[i] = gray;
          data[i+1] = gray;
          data[i+2] = gray;
          // Increase alpha for text, but keep background
          // data[i+3] = 255;
        }

        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (e) {
        console.warn('Preprocess failed, using original:', e);
        resolve(imageUrl);
      }
    };
    img.onerror = () => resolve(imageUrl);
    img.src = imageUrl;
  });
}

export const processImageWithTesseractOCR = async (imageUrl: string, language: string): Promise<OCRResult[]> => {
  try {
    const ocrProvider = (import.meta as any).env?.VITE_OCR_PROVIDER;
    if (ocrProvider === 'cloud') {
      try {
        const cloudResult = await processWithCloudOCR(imageUrl, language);
        if (cloudResult && cloudResult.length > 0) return cloudResult;
      } catch (cloudErr) {
        console.warn('Cloud OCR failed, falling back:', cloudErr);
      }
    }

    const processedImageUrl = await preprocessImage(imageUrl);
    const profile = getLanguageProfile(language);

    // Full mapping for 10+ Duolingo languages - all supported by Tesseract
    const langMap: Record<string, string> = {
      spa: 'spa+eng',
      jpn: 'jpn+eng',
      zho: 'chi_sim+chi_tra+eng',
      fra: 'fra+eng',
      deu: 'deu+eng',
      ita: 'ita+eng',
      por: 'por+eng',
      kor: 'kor+eng',
      nld: 'nld+eng',
      swe: 'swe+eng',
      rus: 'rus+eng',
      ara: 'ara+eng',
      hin: 'hin+eng',
      ell: 'ell+eng',
      pol: 'pol+eng',
      tur: 'tur+eng',
      heb: 'heb+eng',
      vi: 'vie+eng',
      id: 'ind+eng',
      ukr: 'ukr+eng',
      eng: 'eng',
      // legacy
      tha: 'tha+eng',
    };

    const tesseractLang = langMap[language] || `${language}+eng`;
    const worker = await getWorker(tesseractLang);
    const { data: { lines } } = await worker.recognize(processedImageUrl);

    const ocrResults: OCRResult[] = lines
      .filter(line => line.text && line.text.trim().length > 0)
      .filter(line => line.confidence > 25) // slightly lower threshold for Duolingo gray text after our aggressive contrast
      .filter(line => {
        // Filter out likely duolingo logo / junk
        const text = line.text.trim().toLowerCase();
        if (text === 'duolingo') return false;
        if (text.length === 1 && /[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF\u0E00-\u0E7F]/.test(text)) return false;
        return true;
      })
      .map(line => ({
        text: line.text,
        confidence: line.confidence / 100,
        boundingBox: Array.isArray(line.bbox) ? (line.bbox as any).map((c: any) => c) : [],
      }));

    return ocrResults;
  } catch (error) {
    console.error('OCR error:', error);
    throw error;
  }
};

async function processWithCloudOCR(imageUrl: string, language: string): Promise<OCRResult[]> {
  let base64Data: string;
  if (imageUrl.startsWith('blob:')) {
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    base64Data = await blobToBase64(blob);
  } else if (imageUrl.startsWith('data:')) {
    base64Data = imageUrl;
  } else {
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
      prompt: `Extract Duolingo ${language} sentence and English translation. The image is a 1500x1500 sharing image with a white speech bubble on top containing foreign text then English translation. Ignore the small flag icon, the duolingo logo, and the character illustration. The bubble text is the only important content.`,
    }),
  });

  if (!res.ok) throw new Error(`Cloud OCR failed: ${res.status}`);
  const data = await res.json();
  if (data.lines) return data.lines;
  if (data.sourceText || data.translationText) {
    const combined = `${data.sourceText || ''}\n${data.translationText || ''}`;
    return [{ text: combined, confidence: 0.95, boundingBox: [] }];
  }
  return [];
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => { terminateAllWorkers(); });
}
