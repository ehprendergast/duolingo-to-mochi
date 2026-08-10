/**
 * Language Registry — extensible architecture for all Duolingo languages
 * Replaces hardcoded 'spa' | 'jpn' union types with strategy pattern
 */

export type LanguageCode = 
  | 'spa'  // Spanish
  | 'jpn'  // Japanese
  | 'fra'  // French
  | 'deu'  // German
  | 'ita'  // Italian
  | 'por'  // Portuguese
  | 'zho'  // Chinese
  | 'kor'  // Korean
  | 'ara'  // Arabic
  | 'hin'  // Hindi
  | 'tha'  // Thai
  | 'vie'  // Vietnamese
  | 'nld'  // Dutch
  | 'swe'  // Swedish
  | 'tur'  // Turkish
  | 'pol'  // Polish
  | 'ell'  // Greek
  | 'heb'  // Hebrew
  | 'eng'; // English (for translations)

export type TokenizationType = 'spaced' | 'unspaced' | 'mixed';

export interface LanguageProfile {
  code: LanguageCode;
  name: string;
  nativeName: string;
  flag: string;
  tokenization: TokenizationType;
  // For Tesseract OCR — may need multiple langs for accuracy
  ocrLangs: string[]; 
  // For Intl.Segmenter
  segmenterLocale: string;
  // Feature flags
  supportsFurigana: boolean;
  supportsPinyin: boolean;
  supportsDiacritics: boolean;
  rtl?: boolean;
  // UI hints
  wordSeparator: string; // how words are separated visually
  example: string;
}

export const LANGUAGE_REGISTRY: Record<string, LanguageProfile> = {
  spa: {
    code: 'spa',
    name: 'Spanish',
    nativeName: 'Español',
    flag: '🇪🇸',
    tokenization: 'spaced',
    ocrLangs: ['spa', 'eng'],
    segmenterLocale: 'es',
    supportsFurigana: false,
    supportsPinyin: false,
    supportsDiacritics: true,
    wordSeparator: ' ',
    example: 'Hola, ¿cómo estás?'
  },
  jpn: {
    code: 'jpn',
    name: 'Japanese',
    nativeName: '日本語',
    flag: '🇯🇵',
    tokenization: 'unspaced',
    ocrLangs: ['jpn', 'eng'],
    segmenterLocale: 'ja',
    supportsFurigana: true,
    supportsPinyin: false,
    supportsDiacritics: false,
    wordSeparator: '',
    example: '私は学生です。'
  },
  zho: {
    code: 'zho',
    name: 'Chinese',
    nativeName: '中文',
    flag: '🇨🇳',
    tokenization: 'unspaced',
    ocrLangs: ['chi_sim', 'chi_tra', 'eng'],
    segmenterLocale: 'zh',
    supportsFurigana: false,
    supportsPinyin: true,
    supportsDiacritics: false,
    wordSeparator: '',
    example: '你好，世界。'
  },
  fra: {
    code: 'fra',
    name: 'French',
    nativeName: 'Français',
    flag: '🇫🇷',
    tokenization: 'spaced',
    ocrLangs: ['fra', 'eng'],
    segmenterLocale: 'fr',
    supportsFurigana: false,
    supportsPinyin: false,
    supportsDiacritics: true,
    wordSeparator: ' ',
    example: 'Bonjour le monde'
  },
  deu: {
    code: 'deu',
    name: 'German',
    nativeName: 'Deutsch',
    flag: '🇩🇪',
    tokenization: 'spaced',
    ocrLangs: ['deu', 'eng'],
    segmenterLocale: 'de',
    supportsFurigana: false,
    supportsPinyin: false,
    supportsDiacritics: true,
    wordSeparator: ' ',
    example: 'Hallo Welt'
  },
  eng: {
    code: 'eng',
    name: 'English',
    nativeName: 'English',
    flag: '🇬🇧',
    tokenization: 'spaced',
    ocrLangs: ['eng'],
    segmenterLocale: 'en',
    supportsFurigana: false,
    supportsPinyin: false,
    supportsDiacritics: false,
    wordSeparator: ' ',
    example: 'Hello world'
  },
};

// Legacy compatibility — keep old union type working while we migrate
export type LegacyLanguageCode = 'spa' | 'jpn';
export type SourceLanguage = LanguageCode;

export function getLanguageProfile(code: string): LanguageProfile {
  return LANGUAGE_REGISTRY[code] || LANGUAGE_REGISTRY['spa'];
}

export function getAvailableSourceLanguages(): LanguageProfile[] {
  // For MVP, expose spa + jpn, but structure allows all
  return [
    LANGUAGE_REGISTRY['spa'],
    LANGUAGE_REGISTRY['jpn'],
    LANGUAGE_REGISTRY['zho'],
  ];
}

export function isUnspacedLanguage(code: string): boolean {
  const profile = getLanguageProfile(code);
  return profile.tokenization === 'unspaced';
}

// For display in dropdown
export function formatLanguageOption(profile: LanguageProfile): string {
  return `${profile.flag} ${profile.name} → English`;
}
