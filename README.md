# duolingo-to-mochi

Turn Duolingo screenshots (or textbook/ebook photos) into Mochi flashcards with cloze deletions.

Live: https://deluxe-griffin-52035a.netlify.app/

## What it does

Upload a Duolingo screenshot → OCR extracts source + English translation → tap words to create cloze blanks `{{word}}` and bold hints `**word**` → copies Mochi Markdown:

```
# 私は{{学生}}です。
I am a **student**.
-----
# Next card...
```

### New in this version (Japanese major overhaul)

**Japanese pain solved**: Previously you had to drag-select Japanese characters on mobile (no spaces). Now:

- **Tap to cloze**: Japanese sentences are auto-tokenized into words using `Intl.Segmenter` (browser native, zero bundle) with optional `kuromoji.js` enhancement for POS + readings. Nouns/verbs/adjectives are white primary buttons, particles grey secondary, punctuation non-clickable. Just tap like Spanish.
- **Smart POS filtering**: `私は学生です` → `私 / は / 学生 / です` properly separated (noun / particle / noun / aux). Verb stems separated from conjugation.
- **Auto furigana**: When you cloze a kanji word, it automatically becomes `{{{食べ物}(たべもの)}}` using kuromoji reading (katakana → hiragana). Toggle via 振り仮名 ON/OFF.
- **Faster OCR**: Worker singleton caching (was creating new worker per image), canvas preprocessing (greyscale + contrast + 2x upscale + crop Duolingo UI chrome), PSM 6, dual lang `jpn+eng`, concurrent processing.
- **Mobile-first**: 44px min touch targets, 16px inputs to prevent iOS zoom, paste from clipboard support (crucial for Android Chrome), camera capture, Web Share API, haptic feedback, sticky output bottom sheet.
- **Cloud OCR optional**: Add Netlify function `/.netlify/functions/ocr` that proxies to Google Vision or OpenAI Vision (`gpt-4o-mini` vision is excellent at Duolingo UI). Set `VITE_OCR_PROVIDER=cloud` and add API keys in Netlify env. Falls back to Tesseract if not configured.

### Language support

Architecture now uses a registry (`src/services/languageRegistry.ts`) instead of hardcoded `'spa' | 'jpn'`. Adding a new Duolingo language is 1 config entry:

```ts
fra: {
  code: 'fra',
  name: 'French',
  flag: '🇫🇷',
  tokenization: 'spaced',
  ocrLangs: ['fra', 'eng'],
  segmenterLocale: 'fr',
  supportsFurigana: false,
  supportsPinyin: false,
}
```

Currently exposed: Spanish, Japanese (full tap + furigana), Chinese experimental (Intl.Segmenter `zh` + pinyin planned), French/German. Every Duolingo language can be added the same way.

### Furigana & Pinyin

Mochi format: `{{{vocab}(reading)}}`

- Japanese: provided by kuromoji reading, kata → hira conversion via `src/utils/kana.ts`. Auto-enabled when selection contains kanji.
- Chinese: structure ready for `pinyin-pro`, needs tokenization with pinyin library (placeholder in code).

## Tech stack

- Vite + React + Tailwind
- Tesseract.js v5 for free client-side OCR (with preprocessing + cache)
- `Intl.Segmenter` for word segmentation (native, no lib) + `kuromoji.js` lazy from CDN for POS/readings
- Netlify Functions for optional cloud OCR

## Setup

```bash
npm install
npm run dev
```

Optional cloud OCR:

```bash
# .env
VITE_OCR_PROVIDER=cloud
```

Add Netlify env: `GOOGLE_VISION_API_KEY` or `OPENAI_API_KEY` + `OCR_PROVIDER=google|openai`

## Project structure

```
src/
  components/
    JapaneseTokenSelector.tsx   # New: tap-select Japanese with POS coloring + furigana hints
    SelectableText.tsx          # Refactored: delegates to JapaneseTokenSelector for ja, Spaced/Unspaced selectors
    TextPairProcessor.tsx        # Now stores tokens + autoFurigana toggle
    DuolingoProcessor.tsx        # Concurrency, language registry, mobile UX
    ImageUpload.tsx              # Clipboard paste + camera capture
    FormattedTextOutput.tsx      # Modern clipboard API, Web Share, haptics
  services/
    japaneseTokenizer.ts        # Intl.Segmenter + kuromoji lazy CDN loader + POS
    tokenizer.ts                # Generic dispatcher
    languageRegistry.ts         # Extensible Duolingo language profiles
    azureOCR.ts                 # Enhanced: worker cache, canvas preprocess, cloud fallback
  utils/
    kana.ts                     # Kana conversion, kanji detection, particle lists
    formatting.ts               # Now supports {{{kanji}(yomi)}} + token-based formatting
netlify/functions/
  ocr.mjs                       # Cloud OCR proxy (Google Vision / OpenAI Vision)
```

## Future roadmap

- [ ] Bundle all Duolingo languages (40) via registry
- [ ] Chinese pinyin auto via `pinyin-pro`
- [ ] Thai support (unspaced, from your Kanji Tokenization project)
- [ ] Better Duolingo UI cropping using object detection
- [ ] Edit history / undo for selections
- [ ] PWA for offline use on Android

## Original

Created by Eric Prendergast. Source at https://github.com/ehprendergast/duolingo-to-mochi

## License

MIT
