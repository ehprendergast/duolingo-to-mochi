import React, { useState, useEffect, useMemo } from 'react';
import { Token, tokenizeJapanese, tokenizeJapaneseSync, getFuriganaForToken, fetchFuriganaForTokens } from '../services/japaneseTokenizer';

interface JapaneseTokenSelectorProps {
  text: string;
  selections: string[];
  onSelectionsChange: (selections: string[]) => void;
  isSource: boolean;
  autoFurigana?: boolean;
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
  const [cloudFuriganaLoading, setCloudFuriganaLoading] = useState(false);

  useEffect(() => {
    const syncTokens = tokenizeJapaneseSync(text);
    setTokens(syncTokens);
    onTokensChange?.(syncTokens);
  }, [text]);

  // Enhance with kuromoji, then cloud fallback
  useEffect(() => {
    let cancelled = false;
    
    const enhance = async () => {
      if (!text || text.length > 300) return;
      
      setIsEnhancing(true);
      try {
        const enhanced = await tokenizeJapanese(text, { preferKuromoji: true });
        if (cancelled) return;
        
        const hasReadings = enhanced.some(t => t.readingHiragana);
        if (hasReadings) {
          setTokens(enhanced);
          onTokensChange?.(enhanced);
          setKuromojiFailed(false);
        } else {
          // Kuromoji didn't give readings (maybe no dict), try cloud
          setKuromojiFailed(true);
          // Try cloud furigana for kanji tokens if autoFurigana is on
          if (autoFurigana && enhanced.some(t => t.containsKanji)) {
            setCloudFuriganaLoading(true);
            const cloudReadings = await fetchFuriganaForTokens(enhanced, text);
            if (cancelled) return;
            if (cloudReadings.size > 0) {
              const withCloudReadings = enhanced.map(t => {
                const reading = cloudReadings.get(t.index);
                if (reading) {
                  return { ...t, readingHiragana: reading, reading: reading };
                }
                return t;
              });
              setTokens(withCloudReadings);
              onTokensChange?.(withCloudReadings);
            }
            setCloudFuriganaLoading(false);
          }
        }
      } catch (e) {
        if (!cancelled) {
          console.warn('Furigana enhancement failed:', e);
          setKuromojiFailed(true);
          // Also try cloud as last resort
          if (autoFurigana) {
            try {
              setCloudFuriganaLoading(true);
              const currentTokens = tokenizeJapaneseSync(text);
              const cloudReadings = await fetchFuriganaForTokens(currentTokens, text);
              if (!cancelled && cloudReadings.size > 0) {
                const withReadings = currentTokens.map(t => {
                  const r = cloudReadings.get(t.index);
                  return r ? { ...t, readingHiragana: r, reading: r } : t;
                });
                setTokens(withReadings);
                onTokensChange?.(withReadings);
              }
            } catch {} finally {
              if (!cancelled) setCloudFuriganaLoading(false);
            }
          }
        }
      } finally {
        if (!cancelled) setIsEnhancing(false);
      }
    };

    const timer = setTimeout(enhance, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [text, autoFurigana]);

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

  if (!text?.trim()) {
    return <div className="py-3 px-4 rounded-md bg-gray-50 text-gray-400 text-sm">No text</div>;
  }

  const furiganaReadyCount = tokens.filter(t => t.readingHiragana && t.containsKanji).length;
  const totalKanjiTokens = tokens.filter(t => t.containsKanji && !t.isPunctuation).length;

  return (
    <div className="space-y-2">
      <div className={`py-3 px-3 rounded-md flex flex-wrap gap-2 ${isSource ? 'bg-blue-50/50 border border-blue-100' : 'bg-orange-50/50 border border-orange-100'}`}>
        {tokens.map((token) => {
          const selected = isSelected(token);
          const isParticle = token.isParticle;
          const isPunct = token.isPunctuation;
          const isContent = token.isContentWord;
          const hasKanji = token.containsKanji;
          const reading = getFuriganaForToken(token);

          let buttonClass = 'relative inline-flex flex-col items-center px-3 py-2 rounded-lg text-[15px] transition-all duration-150 border active:scale-95 select-none ';
          if (isPunct) {
            buttonClass += 'bg-transparent border-transparent text-gray-400 px-1 cursor-default ';
          } else if (selected) {
            buttonClass += isSource ? 'bg-blue-500 text-white border-blue-600 shadow-md font-medium min-h-[44px] ' : 'bg-orange-500 text-white border-orange-600 shadow-md font-bold min-h-[44px] ';
          } else {
            if (isContent) {
              buttonClass += hasKanji
                ? isSource ? 'bg-white hover:bg-blue-100 text-gray-800 border-gray-200 hover:border-blue-300 hover:shadow-sm min-h-[44px] ' : 'bg-white hover:bg-orange-100 text-gray-800 border-gray-200 min-h-[44px] '
                : 'bg-white hover:bg-gray-100 text-gray-700 border-gray-200 min-h-[40px] ';
            } else if (isParticle) {
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
              title={reading ? `${token.surface} (${reading})${token.pos ? ` — ${token.pos}` : ''}` : token.pos ? `${token.surface} — ${token.pos}` : token.surface}
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <span className="leading-tight">{token.surface}</span>
              {autoFurigana && hasKanji && reading && !selected && !isPunct && (
                <span className="text-[10px] leading-none opacity-60 mt-0.5 font-normal max-w-[60px] truncate">{reading}</span>
              )}
              {selected && isSource && hasKanji && reading && autoFurigana && (
                <span className="text-[10px] leading-none opacity-90 mt-0.5 font-normal max-w-[70px] truncate">{reading}</span>
              )}
              {isParticle && !selected && <span className="text-[9px] opacity-40 leading-none">助詞</span>}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 px-1">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
          <span>{tokens.filter(t => t.isContentWord).length} words · {tokens.filter(t => t.isParticle).length} particles</span>
          {isEnhancing && <span className="flex items-center gap-1 text-blue-500"><span className="inline-block w-3 h-3 border border-blue-300 border-t-blue-500 rounded-full animate-spin" /> loading furigana…</span>}
          {cloudFuriganaLoading && <span className="flex items-center gap-1 text-purple-500"><span className="inline-block w-3 h-3 border border-purple-300 border-t-purple-500 rounded-full animate-spin" /> cloud furigana…</span>}
          {!isEnhancing && !cloudFuriganaLoading && furiganaReadyCount > 0 && (
            <span className="text-green-600">✓ {furiganaReadyCount}/{totalKanjiTokens} furigana ready</span>
          )}
          {!isEnhancing && !cloudFuriganaLoading && furiganaReadyCount === 0 && totalKanjiTokens > 0 && kuromojiFailed && (
            <span className="text-amber-600">⚠ {totalKanjiTokens} kanji - set ANTHROPIC_API_KEY in Netlify (or OPENAI) then redeploy</span>
          )}
        </div>
        {autoFurigana && (
          <div className="text-[10px] text-gray-400 font-mono">
            {'{{{kanji}(yomi)}}'} auto
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 text-[10px] text-gray-400 px-1">
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-white border border-gray-200 rounded inline-block" /> content</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-gray-50 border border-gray-200 rounded inline-block" /> particle</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-500 rounded inline-block" /> cloze</span>
      </div>
    </div>
  );
};

export default JapaneseTokenSelector;
