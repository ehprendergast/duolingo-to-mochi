import React, { useState, useEffect, useCallback } from 'react';
import { ProcessedTextPair } from '../types';
import SelectableText from './SelectableText';
import { Token } from '../services/japaneseTokenizer';
import { getLanguageProfile } from '../services/languageRegistry';
import { Trash2, Edit2, Check, X, Sparkles } from 'lucide-react';

interface TextPairProcessorProps {
  textPair: ProcessedTextPair;
  onUpdate: (updated: ProcessedTextPair) => void;
  onDelete: (id: string) => void;
}

const TextPairProcessor: React.FC<TextPairProcessorProps> = ({ 
  textPair, 
  onUpdate,
  onDelete
}) => {
  const [sourceSelections, setSourceSelections] = useState<string[]>(textPair.sourceSelections || []);
  const [translationSelections, setTranslationSelections] = useState<string[]>(textPair.translationSelections || []);
  const [sourceTokens, setSourceTokens] = useState<Token[]>(textPair.sourceTokens || []);
  const [autoFurigana, setAutoFurigana] = useState<boolean>(textPair.autoFurigana ?? true);
  const [isEditing, setIsEditing] = useState(false);
  const [editedSource, setEditedSource] = useState(textPair.sourceText);
  const [editedTranslation, setEditedTranslation] = useState(textPair.translationText);

  const profile = getLanguageProfile(textPair.sourceLanguage);
  const isJapanese = textPair.sourceLanguage === 'jpn';
  const isUnspaced = profile.tokenization === 'unspaced';

  // Update parent component when selections/tokens change — useCallback to avoid infinite loop
  useEffect(() => {
    if (!isEditing) {
      const needsUpdate = 
        JSON.stringify(sourceSelections) !== JSON.stringify(textPair.sourceSelections) ||
        JSON.stringify(translationSelections) !== JSON.stringify(textPair.translationSelections) ||
        JSON.stringify(sourceTokens) !== JSON.stringify(textPair.sourceTokens) ||
        autoFurigana !== textPair.autoFurigana;

      if (needsUpdate) {
        onUpdate({
          ...textPair,
          sourceSelections,
          translationSelections,
          sourceTokens,
          autoFurigana,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceSelections, translationSelections, sourceTokens, autoFurigana, isEditing]);

  const handleSaveEdit = () => {
    onUpdate({
      ...textPair,
      sourceText: editedSource,
      translationText: editedTranslation,
      sourceSelections: [],
      translationSelections: [],
      sourceTokens: [],
      autoFurigana,
    });
    setSourceSelections([]);
    setTranslationSelections([]);
    setSourceTokens([]);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditedSource(textPair.sourceText);
    setEditedTranslation(textPair.translationText);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSaveEdit();
    }
  };

  const handleSourceTokensChange = useCallback((tokens: Token[]) => {
    setSourceTokens(tokens);
  }, []);

  return (
    <div className="border rounded-xl overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow duration-200 mb-4">
      <div className="border-b px-4 py-3 bg-gray-50 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-gray-700 text-sm">
            #{textPair.id.slice(-4)} {profile.flag} {profile.name}
          </h3>
          {sourceSelections.length > 0 && (
            <span className="bg-blue-100 text-blue-700 text-[11px] px-2 py-0.5 rounded-full">
              {sourceSelections.length} cloze
            </span>
          )}
        </div>
        
        <div className="flex items-center space-x-1">
          {isJapanese && !isEditing && (
            <button
              onClick={() => setAutoFurigana(!autoFurigana)}
              className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-colors ${
                autoFurigana
                  ? 'bg-purple-100 text-purple-700 border border-purple-200'
                  : 'bg-gray-100 text-gray-500 border border-transparent'
              }`}
              title="Toggle auto furigana"
            >
              <Sparkles size={12} />
              {autoFurigana ? '振り仮名ON' : '振り仮名OFF'}
            </button>
          )}
          {isEditing ? (
            <>
              <button
                onClick={handleSaveEdit}
                className="text-green-600 hover:text-green-700 transition-colors p-2 rounded-full hover:bg-green-50 min-h-[40px] min-w-[40px] flex items-center justify-center"
                aria-label="Save edits"
              >
                <Check size={18} />
              </button>
              <button
                onClick={handleCancelEdit}
                className="text-gray-400 hover:text-gray-500 transition-colors p-2 rounded-full hover:bg-gray-100 min-h-[40px] min-w-[40px] flex items-center justify-center"
                aria-label="Cancel edits"
              >
                <X size={18} />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setIsEditing(true)}
                className="text-blue-500 hover:text-blue-600 transition-colors p-2 rounded-full hover:bg-blue-50 min-h-[40px] min-w-[40px] flex items-center justify-center"
                aria-label="Edit text pair"
              >
                <Edit2 size={16} />
              </button>
              <button 
                onClick={() => onDelete(textPair.id)}
                className="text-gray-400 hover:text-red-500 transition-colors p-2 rounded-full hover:bg-red-50 min-h-[40px] min-w-[40px] flex items-center justify-center"
                aria-label="Delete text pair"
              >
                <Trash2 size={16} />
              </button>
            </>
          )}
        </div>
      </div>
      
      <div className="p-4 space-y-4">
        {/* Source Text */}
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5 rounded">
              {profile.name} Source
            </span>
            <span className="text-xs text-gray-500">
              {isUnspaced ? 'Tap tokens to {{blank}} • particles grey • content white' : 'Tap words to {{blank out}}'}
            </span>
            {isJapanese && autoFurigana && (
              <span className="text-[10px] text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-100">
                {'{{{kanji}(yomi)}}'} auto
              </span>
            )}
          </div>
          {isEditing ? (
            <textarea
              value={editedSource}
              onChange={(e) => setEditedSource(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full p-3 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-[16px]" // 16px prevents iOS zoom
              rows={2}
            />
          ) : (
            <SelectableText 
              text={textPair.sourceText} 
              selections={sourceSelections}
              onSelectionsChange={setSourceSelections}
              isSource={true}
              sourceLanguage={textPair.sourceLanguage}
              onTokensChange={handleSourceTokensChange}
            />
          )}
        </div>
        
        {/* Translation Text */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-orange-100 text-orange-800 text-xs font-medium px-2 py-0.5 rounded">English Translation</span>
            <span className="text-xs text-gray-500 ml-1">
              Tap words to **bold**
            </span>
          </div>
          {isEditing ? (
            <textarea
              value={editedTranslation}
              onChange={(e) => setEditedTranslation(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full p-3 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-[16px]"
              rows={2}
            />
          ) : (
            <SelectableText 
              text={textPair.translationText} 
              selections={translationSelections}
              onSelectionsChange={setTranslationSelections}
              isSource={false}
              sourceLanguage={textPair.sourceLanguage}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default TextPairProcessor;
