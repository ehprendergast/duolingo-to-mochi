import React, { useState, useMemo, useEffect } from 'react';
import JapaneseTokenSelector from './JapaneseTokenSelector';
import { Token } from '../services/japaneseTokenizer';
import { tokenizeWithIntl } from '../services/japaneseTokenizer';
import { containsKanji } from '../utils/kana';

interface SelectableTextProps {
  text: string;
  selections: string[];
  onSelectionsChange: (selections: string[]) => void;
  isSource: boolean;
  sourceLanguage?: string; // now supports 'spa' | 'jpn' | 'zho' | etc
  onTokensChange?: (tokens: Token[]) => void;
}

const SelectableText: React.FC<SelectableTextProps> = ({
  text,
  selections,
  onSelectionsChange,
  isSource,
  sourceLanguage = 'spa',
  onTokensChange,
}) => {
  const isJapanese = sourceLanguage === 'jpn';
  const isChinese = sourceLanguage === 'zho';
  const isUnspaced = isJapanese || isChinese || sourceLanguage === 'tha';

  // For Japanese/Chinese, delegate to token selector
  if (isJapanese) {
    return (
      <JapaneseTokenSelector
        text={text}
        selections={selections}
        onSelectionsChange={onSelectionsChange}
        isSource={isSource}
        autoFurigana={true}
        onTokensChange={onTokensChange}
      />
    );
  }

  if (isUnspaced) {
    return (
      <UnspacedTokenSelector
        text={text}
        language={sourceLanguage}
        selections={selections}
        onSelectionsChange={onSelectionsChange}
        isSource={isSource}
        onTokensChange={onTokensChange}
      />
    );
  }

  // Spaced languages — improved click selector (Spanish, French, German, etc)
  return (
    <SpacedTokenSelector
      text={text}
      selections={selections}
      onSelectionsChange={onSelectionsChange}
      isSource={isSource}
    />
  );
};

// Component for spaced languages like Spanish — now with better mobile UX
const SpacedTokenSelector: React.FC<{
  text: string;
  selections: string[];
  onSelectionsChange: (selections: string[]) => void;
  isSource: boolean;
}> = ({ text, selections, onSelectionsChange, isSource }) => {
  const selectedSet = useMemo(() => new Set(selections), [selections]);

  // Use same tokenization as formatting.ts, but create wordIdx that skips
  // punctuation/whitespace so indices align with formatter's wordIdx.
  // Bug was: old code counted punctuation as index, formatter didn't -> off-by-N.
  const allParts = text.match(/[\p{L}\p{N}\p{M}’']+|[^\s\p{L}\p{N}]+|\s+/gu) || [text];

  type Item =
    | { type: 'punct'; surface: string; key: string }
    | { type: 'word'; surface: string; index: number; key: string };

  const items: Item[] = [];
  let wordIdxCounter = 0;
  let keyCounter = 0;
  for (const part of allParts) {
    if (/^\s+$/.test(part)) continue; // whitespace handled by flex gap
    if (/^[^\p{L}\p{N}]+$/u.test(part)) {
      items.push({ type: 'punct', surface: part, key: `p_${keyCounter++}_${part}` });
    } else {
      items.push({ type: 'word', surface: part, index: wordIdxCounter++, key: `w_${keyCounter++}_${part}` });
    }
  }

  const toggleWord = (word: string, index: number) => {
    const wordId = `${word}_${index}`;
    if (selectedSet.has(wordId)) {
      onSelectionsChange(selections.filter(s => s !== wordId));
    } else {
      onSelectionsChange([...selections, wordId]);
    }
  };

  return (
    <div
      className={`py-3 px-3 rounded-md border flex flex-wrap gap-2 ${
        isSource ? 'bg-blue-50/50 border-blue-100' : 'bg-orange-50/50 border-orange-100'
      }`}
    >
      {items.map(item => {
        if (item.type === 'punct') {
          return (
            <span key={item.key} className="px-1 py-2 text-gray-400 text-[15px]">
              {item.surface}
            </span>
          );
        }

        const wordId = `${item.surface}_${item.index}`;
        const isSelected = selectedSet.has(wordId);

        return (
          <button
            key={item.key}
            onClick={() => toggleWord(item.surface, item.index)}
            className={`px-3 py-2 rounded-lg text-[15px] transition-all duration-150 border active:scale-95 select-none min-h-[44px] ${
              isSelected
                ? isSource
                  ? 'bg-blue-500 text-white border-blue-600 shadow-md font-medium'
                  : 'bg-orange-500 text-white border-orange-600 shadow-md font-bold'
                : 'bg-white hover:bg-gray-100 text-gray-800 border-gray-200 hover:border-gray-300 hover:shadow-sm'
            }`}
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            {isSelected && isSource ? `{{${item.surface}}}` : isSelected && !isSource ? `**${item.surface}**` : item.surface}
          </button>
        );
      })}
    </div>
  );
};

// Generic unspaced language selector (Chinese, Thai, etc)
const UnspacedTokenSelector: React.FC<{
  text: string;
  language: string;
  selections: string[];
  onSelectionsChange: (selections: string[]) => void;
  isSource: boolean;
  onTokensChange?: (tokens: Token[]) => void;
}> = ({ text, language, selections, onSelectionsChange, isSource, onTokensChange }) => {
  const localeMap: Record<string, string> = {
    zho: 'zh',
    jpn: 'ja',
    tha: 'th',
    kor: 'ko',
  };
  const locale = localeMap[language] || 'en';

  const [tokens, setTokens] = useState<Token[]>(() => tokenizeWithIntl(text, locale));

  useEffect(() => {
    const newTokens = tokenizeWithIntl(text, locale);
    setTokens(newTokens);
    onTokensChange?.(newTokens);
  }, [text, locale]);

  const selectedSet = useMemo(() => new Set(selections), [selections]);

  const toggleToken = (token: Token) => {
    const id = `${token.surface}_${token.index}`;
    if (selectedSet.has(id)) {
      onSelectionsChange(selections.filter(s => s !== id));
    } else {
      onSelectionsChange([...selections, id]);
    }
  };

  const isSelected = (token: Token) => selectedSet.has(`${token.surface}_${token.index}`);

  return (
    <div className="space-y-2">
      <div
        className={`py-3 px-3 rounded-md border flex flex-wrap gap-2 ${
          isSource ? 'bg-blue-50/50 border-blue-100' : 'bg-orange-50/50 border-orange-100'
        }`}
      >
        {tokens.map(token => {
          const selected = isSelected(token);
          const hasKanji = token.containsKanji || containsKanji(token.surface);

          return (
            <button
              key={`${token.surface}-${token.index}`}
              onClick={() => !token.isPunctuation && toggleToken(token)}
              disabled={token.isPunctuation}
              className={`px-3 py-2 rounded-lg text-[15px] transition-all duration-150 border active:scale-95 select-none min-h-[44px] ${
                token.isPunctuation
                  ? 'bg-transparent border-transparent text-gray-400 px-1 cursor-default'
                  : selected
                  ? isSource
                    ? 'bg-blue-500 text-white border-blue-600 shadow-md font-medium'
                    : 'bg-orange-500 text-white border-orange-600 shadow-md font-bold'
                  : hasKanji || token.isContentWord
                  ? 'bg-white hover:bg-blue-50 text-gray-800 border-gray-200 hover:border-blue-200'
                  : 'bg-gray-50 hover:bg-gray-100 text-gray-600 border-gray-200 text-[13px]'
              }`}
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              {token.surface}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default SelectableText;
