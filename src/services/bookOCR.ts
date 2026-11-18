import { createWorker } from 'tesseract.js';

/**
 * Book Page transcription service.
 *
 * Primary path: the /.netlify/functions/book-ocr Netlify function, which
 * sends the page photo to a vision LLM (Anthropic, else OpenAI) and
 * returns Markdown with LaTeX math and fenced code blocks.
 *
 * Fallback: if the function is unconfigured (501) or fails, run
 * Tesseract.js locally with 'eng' so the mode still works with no cloud
 * keys — but math and code will come out as raw text and need fixing by
 * hand. The caller surfaces a note when `fallback` is true.
 *
 * The fallback deliberately does NOT reuse azureOCR's
 * processImageWithTesseractOCR: that pipeline's preprocessing crops
 * Duolingo UI chrome (bottom 38% of square images, header/nav of tall
 * ones), which would cut real text off a book page. Here Tesseract runs
 * on the untouched photo.
 */

export interface BookTranscription {
  markdown: string;
  /** 'anthropic' | 'openai' | 'tesseract' */
  provider: string;
  /** True when the on-device Tesseract fallback produced the text */
  fallback: boolean;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function imageUrlToBase64(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith('data:')) return imageUrl;
  const response = await fetch(imageUrl);
  const blob = await response.blob();
  return blobToBase64(blob);
}

async function transcribeWithTesseract(imageUrl: string): Promise<string> {
  const worker = await createWorker('eng', 1, {
    logger: () => {},
  });
  try {
    const { data } = await worker.recognize(imageUrl);
    return data.text.trim();
  } finally {
    try {
      await worker.terminate();
    } catch {
      // worker already gone — nothing to clean up
    }
  }
}

export async function transcribeBookPage(imageUrl: string): Promise<BookTranscription> {
  try {
    const base64Data = await imageUrlToBase64(imageUrl);
    const res = await fetch('/.netlify/functions/book-ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64Data }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.markdown === 'string' && data.markdown.trim()) {
        return { markdown: data.markdown, provider: data.provider || 'cloud', fallback: false };
      }
      console.warn('Book OCR function returned no markdown, falling back to Tesseract');
    } else {
      console.warn(`Book OCR function failed (${res.status}), falling back to Tesseract`);
    }
  } catch (err) {
    console.warn('Book OCR request failed, falling back to Tesseract:', err);
  }

  const text = await transcribeWithTesseract(imageUrl);
  return { markdown: text, provider: 'tesseract', fallback: true };
}
