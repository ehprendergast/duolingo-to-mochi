/**
 * Language Registry — only Duolingo-supported languages
 * Thai (tha) and similar non-Duo languages are intentionally excluded
 * per user requirement. All entries below are currently offered by Duolingo.
 */

export type LanguageCode = 
  | 'spa'  // Spanish
  | 'jpn'  // Japanese
  | 'zho'  // Chinese (Mandarin)
  | 'fra'  // French
  | 'deu'  // German
  | 'ita'  // Italian
  | 'por'  // Portuguese (Brazil)
  | 'kor'  // Korean
  | 'nld'  // Dutch
  | 'rus'  // Russian
  | 'ara'  // Arabic
  | 'hin'  // Hindi
  | 'tur'  // Turkish
  | 'pol'  // Polish
  | 'ell'  // Greek
  | 'swe'  // Swedish
  | 'heb'  // Hebrew
  | 'vi'   // Vietnamese
  | 'id'   // Indonesian
  | 'ukr'  // Ukrainian
  | 'eng'; // English (translations)

export type TokenizationType = 'spaced' | 'unspaced' | 'mixed';

export interface LanguageProfile {
  code: LanguageCode;
  name: string;
  nativeName: string;
  flag: string;
  tokenization: TokenizationType;
  ocrLangs: string[];
  segmenterLocale: string;
  supportsFurigana: boolean;
  supportsPinyin: boolean;
  supportsDiacritics: boolean;
  rtl?: boolean;
  wordSeparator: string;
  example: string;
  duoSupported: boolean;
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
    example: 'Hola, ¿cómo estás?',
    duoSupported: true
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
    example: '私は学生です。',
    duoSupported: true
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
    example: '你好，世界。',
    duoSupported: true
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
    example: 'Bonjour le monde',
    duoSupported: true
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
    example: 'Hallo Welt',
    duoSupported: true
  },
  ita: {
    code: 'ita',
    name: 'Italian',
    nativeName: 'Italiano',
    flag: '🇮🇹',
    tokenization: 'spaced',
    ocrLangs: ['ita', 'eng'],
    segmenterLocale: 'it',
    supportsFurigana: false,
    supportsPinyin: false,
    supportsDiacritics: true,
    wordSeparator: ' ',
    example: 'Ciao mondo',
    duoSupported: true
  },
  por: {
    code: 'por',
    name: 'Portuguese',
    nativeName: 'Português',
    flag: '🇧🇷',
    tokenization: 'spaced',
    ocrLangs: ['por', 'eng'],
    segmenterLocale: 'pt',
    supportsFurigana: false,
    supportsPinyin: false,
    supportsDiacritics: true,
    wordSeparator: ' ',
    example: 'Olá mundo',
    duoSupported: true
  },
  kor: {
    code: 'kor',
    name: 'Korean',
    nativeName: '한국어',
    flag: '🇰🇷',
    tokenization: 'spaced', // Korean uses spaces
    ocrLangs: ['kor', 'eng'],
    segmenterLocale: 'ko',
    supportsFurigana: false,
    supportsPinyin: false,
    supportsDiacritics: false,
    wordSeparator: ' ',
    example: '안녕하세요',
    duoSupported: true
  },
  nld: {
    code: 'nld',
    name: 'Dutch',
    nativeName: 'Nederlands',
    flag: '🇳🇱',
    tokenization: 'spaced',
    ocrLangs: ['nld', 'eng'],
    segmenterLocale: 'nl',
    supportsFurigana: false,
    supportsPinyin: false,
    supportsDiacritics: true,
    wordSeparator: ' ',
    example: 'Hallo wereld',
    duoSupported: true
  },
  swe: {
    code: 'swe',
    name: 'Swedish',
    nativeName: 'Svenska',
    flag: '🇸🇪',
    tokenization: 'spaced',
    ocrLangs: ['swe', 'eng'],
    segmenterLocale: 'sv',
    supportsFurigana: false,
    supportsPinyin: false,
    supportsDiacritics: true,
    wordSeparator: ' ',
    example: 'Hej världen',
    duoSupported: true
  },
  // Additional Duolingo languages — not in initial 10 but supported for future expansion
  rus: {
    code: 'rus',
    name: 'Russian',
    nativeName: 'Русский',
    flag: '🇷🇺',
    tokenization: 'spaced',
    ocrLangs: ['rus', 'eng'],
    segmenterLocale: 'ru',
    supportsFurigana: false,
    supportsPinyin: false,
    supportsDiacritics: false,
    wordSeparator: ' ',
    example: 'Привет мир',
    duoSupported: true
  },
  ara: {
    code: 'ara',
    name: 'Arabic',
    nativeName: 'العربية',
    flag: '🇸🇦',
    tokenization: 'spaced',
    ocrLangs: ['ara', 'eng'],
    segmenterLocale: 'ar',
    supportsFurigana: false,
    supportsPinyin: false,
    supportsDiacritics: false,
    rtl: true,
    wordSeparator: ' ',
    example: 'مرحبا بالعالم',
    duoSupported: true
  },
  hin: {
    code: 'hin',
    name: 'Hindi',
    nativeName: 'हिन्दी',
    flag: '🇮🇳',
    tokenization: 'spaced',
    ocrLangs: ['hin', 'eng'],
    segmenterLocale: 'hi',
    supportsFurigana: false,
    supportsPinyin: false,
    supportsDiacritics: false,
    wordSeparator: ' ',
    example: 'नमस्ते दुनिया',
    duoSupported: true
  },
  ell: {
    code: 'ell',
    name: 'Greek',
    nativeName: 'Ελληνικά',
    flag: '🇬🇷',
    tokenization: 'spaced',
    ocrLangs: ['ell', 'eng'],
    segmenterLocale: 'el',
    supportsFurigana: false,
    supportsPinyin: false,
    supportsDiacritics: true,
    wordSeparator: ' ',
    example: 'Γειά σου Κόσμε',
    duoSupported: true
  },
  pol: {
    code: 'pol',
    name: 'Polish',
    nativeName: 'Polski',
    flag: '🇵🇱',
    tokenization: 'spaced',
    ocrLangs: ['pol', 'eng'],
    segmenterLocale: 'pl',
    supportsFurigana: false,
    supportsPinyin: false,
    supportsDiacritics: true,
    wordSeparator: ' ',
    example: 'Witaj świecie',
    duoSupported: true
  },
  tur: {
    code: 'tur',
    name: 'Turkish',
    nativeName: 'Türkçe',
    flag: '🇹🇷',
    tokenization: 'spaced',
    ocrLangs: ['tur', 'eng'],
    segmenterLocale: 'tr',
    supportsFurigana: false,
    supportsPinyin: false,
    supportsDiacritics: true,
    wordSeparator: ' ',
    example: 'Merhaba dünya',
    duoSupported: true
  },
  heb: {
    code: 'heb',
    name: 'Hebrew',
    nativeName: 'עברית',
    flag: '🇮🇱',
    tokenization: 'spaced',
    ocrLangs: ['heb', 'eng'],
    segmenterLocale: 'he',
    supportsFurigana: false,
    supportsPinyin: false,
    supportsDiacritics: false,
    rtl: true,
    wordSeparator: ' ',
    example: 'שלום עולם',
    duoSupported: true
  },
  vi: {
    code: 'vi',
    name: 'Vietnamese',
    nativeName: 'Tiếng Việt',
    flag: '🇻🇳',
    tokenization: 'spaced',
    ocrLangs: ['vie', 'eng'],
    segmenterLocale: 'vi',
    supportsFurigana: false,
    supportsPinyin: false,
    supportsDiacritics: true,
    wordSeparator: ' ',
    example: 'Xin chào thế giới',
    duoSupported: true
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
    example: 'Hello world',
    duoSupported: true
  },
};

export type LegacyLanguageCode = 'spa' | 'jpn';
export type SourceLanguage = LanguageCode;

export function getLanguageProfile(code: string): LanguageProfile {
  return LANGUAGE_REGISTRY[code] || LANGUAGE_REGISTRY['spa'];
}

// Top 10 Duolingo languages by popularity - only Duo-supported
export function getAvailableSourceLanguages(): LanguageProfile[] {
  return [
    LANGUAGE_REGISTRY['spa'], // Spanish - most popular
    LANGUAGE_REGISTRY['jpn'], // Japanese
    LANGUAGE_REGISTRY['zho'], // Chinese
    LANGUAGE_REGISTRY['fra'], // French
    LANGUAGE_REGISTRY['deu'], // German
    LANGUAGE_REGISTRY['ita'], // Italian
    LANGUAGE_REGISTRY['por'], // Portuguese (Brazil)
    LANGUAGE_REGISTRY['kor'], // Korean
    LANGUAGE_REGISTRY['nld'], // Dutch
    LANGUAGE_REGISTRY['swe'], // Swedish
  ];
}

// All Duolingo-supported source languages (can be 20+)
export function getAllDuolingoLanguages(): LanguageProfile[] {
  return Object.values(LANGUAGE_REGISTRY).filter(p => p.duoSupported && p.code !== 'eng');
}

export function isUnspacedLanguage(code: string): boolean {
  const profile = getLanguageProfile(code);
  return profile.tokenization === 'unspaced';
}

export function isRTLLanguage(code: string): boolean {
  const profile = getLanguageProfile(code);
  return !!profile.rtl;
}

export function formatLanguageOption(profile: LanguageProfile): string {
  return `${profile.flag} ${profile.name} → English`;
}
