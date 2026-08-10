import React, { useState, useEffect, useMemo } from 'react';
import { Token, tokenizeJapanese, tokenizeJapaneseSync, getFuriganaForToken } from '../services/japaneseTokenizer';
import { containsKanji } from '../utils/kana';

interface JapaneseTokenSelectorProps {
  text: string;
  selections: string[]; // format: `${surface}_${index}` for compatibility
  onSelectionsChange: (selections: string[]) => void;
  isSource: boolean;
  // For future: allow controlling furigana
  autoFurigana?: boolean;
  // Callback to provide token metadata for formatting (furigana)
  onTokensChange?: (tokens: Token[]) => void;
}

const JapaneseTokenSelector: React.FC<JapaneseTokenSelectorProps> = ({
  text,
  selections,
  onSelectionsChange,
  isSource,
  autoFurigana = true,
  onTokensChange,
}) => {
  const [tokens, setTokens] = useState<Token[]>(() => tokenizeJapaneseSync(text));
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [kuromojiFailed, setKuromojiFailed] = useState(false);

  // Re-tokenize when text changes
  useEffect(() => {
    const syncTokens = tokenizeJapaneseSync(text);
    setTokens(syncTokens);
    onTokensChange?.(syncTokens);
  }, [text]);

  // Enhance with kuromoji async for furigana — progressive enhancement
  useEffect(() => {
    let cancelled = false;
    
    const enhance = async () => {
      if (!text || text.length > 200) return; // Don't enhance very long texts automatically
      
      setIsEnhancing(true);
      try {
        const enhanced = await tokenizeJapanese(text, { preferKuromoji: true });
        if (!cancelled && enhanced.length > 0) {
          // Only update if we got readings (kuromoji succeeded)
          const hasReadings = enhanced.some(t => t.readingHiragana);
          if (hasReadings) {
            setTokens(enhanced);
            onTokensChange?.(enhanced);
          }
        }
      } catch {
        if (!cancelled) setKuromojiFailed(true);
      } finally {
        if (!cancelled) setIsEnhancing(false);
      }
    };

    // Delay enhancement slightly to not block UI
    const timer = setTimeout(enhance, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [text]);

  const selectedSet = useMemo(() => new Set(selections), [selections]);

  const toggleToken = (token: Token) => {
    const id = `${token.surface}_${token.index}`;
    if (selectedSet.has(id)) {
      onSelectionsChange(selections.filter(s => s !== id));
    } else {
      onSelectionsChange([...selections, id]);
    }
  };

  const isSelected = (token: Token) => {
    return selectedSet.has(`${token.surface}_${token.index}`);
  };

  if (!text?.trim()) {
    return (
      <div className="py-3 px-4 rounded-md bg-gray-50 text-gray-400 text-sm">
        No text
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Token display — mobile-optimized with larger touch targets */}
      <div
        className={`py-3 px-3 rounded-md flex flex-wrap gap-2 ${
          isSource ? 'bg-blue-50/50 border border-blue-100' : 'bg-orange-50/50 border border-orange-100'
        }`}
      >
        {tokens.map((token) => {
          const selected = isSelected(token);
          const isParticle = token.isParticle;
          const isPunct = token.isPunctuation;
          const isContent = token.isContentWord;
          const hasKanji = token.containsKanji;
          const reading = getFuriganaForToken(token);

          // Determine styling based on POS and selection
          let buttonClass = 'relative inline-flex flex-col items-center px-3 py-2 rounded-lg text-[15px] transition-all duration-150 border active:scale-95 select-none ';

          if (isPunct) {
            // Punctuation — non-clickable, muted
            buttonClass += 'bg-transparent border-transparent text-gray-400 px-1 cursor-default ';
          } else if (selected) {
            if (isSource) {
              buttonClass += 'bg-blue-500 text-white border-blue-600 shadow-md font-medium min-h-[44px] ';
            } else {
              buttonClass += 'bg-orange-500 text-white border-orange-600 shadow-md font-bold min-h-[44px] ';
            }
          } else {
            // Unselected — differentiate content vs particle
            if (isContent) {
              if (hasKanji) {
                // Kanji words — primary, more prominent
                buttonClass += isSource
                  ? 'bg-white hover:bg-blue-100 text-gray-800 border-gray-200 hover:border-blue-300 hover:shadow-sm min-h-[44px] '
                  : 'bg-white hover:bg-orange-100 text-gray-800 border-gray-200 hover:border-orange-300 hover:shadow-sm min-h-[44px] ';
              } else {
                // Kana content words
                buttonClass += 'bg-white hover:bg-gray-100 text-gray-700 border-gray-200 hover:border-gray-300 min-h-[40px] ';
              }
            } else if (isParticle) {
              // Particles — smaller, muted, but still clickable (secondary)
              buttonClass += 'bg-gray-50 hover:bg-gray-100 text-gray-500 border-gray-200 text-[13px] px-2 py-1 min-h-[36px] ';
            } else {
              buttonClass += 'bg-white hover:bg-gray-100 text-gray-600 border-gray-200 min-h-[40px] ';
            }
          }

          return (
            <button
              key={`${token.surface}-${token.index}-${token.start}`}
              onClick={() => !isPunct && toggleToken(token)}
              disabled={isPunct}
              className={buttonClass}
              title={
                reading
                  ? `${token.surface} (${reading})${token.pos ? ` — ${token.pos}` : ''}`
                  : token.pos
                  ? `${token.surface} — ${token.pos}`
                  : token.surface
              }
              style={{
                // Android Chrome: prevent tap highlight double
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {/* Surface form */}
              <span className="leading-tight">{token.surface}</span>
              
              {/* Show furigana hint for kanji tokens when autoFurigana is on and token not selected */}
              {autoFurigana && hasKanji && reading && !selected && !isPunct && (
                <span className="text-[10px] leading-none opacity-60 mt-0.5 font-normal">
                  {reading.slice(0, 8)}
                </span>
              )}

              {/* Selection indicator for source */}
              {selected && isSource && hasKanji && reading && autoFurigana && (
                <span className="text-[10px] leading-none opacity-90 mt-0.5 font-normal">
                  {reading}
                </span>
              )}

              {/* Particle label for learning */}
              {isParticle && !selected && (
                <span className="text-[9px] opacity-40 leading-none">助詞</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2 text-[11px] text-gray-400">
          <span>
            {tokens.filter(t => t.isContentWord).length} content words · {tokens.filter(t => t.isParticle).length} particles
          </span>
          {isEnhancing && (
            <span className="flex items-center gap-1 text-blue-500">
              <span className="inline-block w-3 h-3 border border-blue-300 border-t-blue-500 rounded-full animate-spin" />
              loading readings…
            </span>
          )}
          {!isEnhancing && tokens.some(t => t.readingHiragana) && (
            <span className="text-green-600">✓ furigana ready</span>
          )}
          {kuromojiFailed && (
            <span className="text-amber-500">offline mode (no furigana)</span>
          )}
        </div>

        {/* Furigana toggle info */}
        {autoFurigana && (
          <div className="text-[11px] text-gray-400">
            auto furigana: <span className="font-mono text-gray-600">{'{{'}kanji{'}'}{'(yomi)'}{'}}'}</span>
          </div>
        )}
      </div>

      {/* Quick legend for new users — only show once, compact */}
      <div className="flex flex-wrap gap-2 text-[10px] text-gray-400 px-1">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 bg-white border border-gray-200 rounded inline-block" /> content
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 bg-gray-50 border border-gray-200 rounded inline-block" /> particle
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 bg-blue-500 rounded inline-block" /> selected cloze
        </span>
      </div>
    </div>
  );
};

export default JapaneseTokenSelector;
