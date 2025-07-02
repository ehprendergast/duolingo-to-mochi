import React, { useState, useEffect, useRef } from 'react';

interface SelectableTextProps {
  text: string;
  selections: string[];
  onSelectionsChange: (selections: string[]) => void;
  isSource: boolean;
  sourceLanguage?: 'spa' | 'jpn';
}

const SelectableText: React.FC<SelectableTextProps> = ({
  text,
  selections,
  onSelectionsChange,
  isSource,
  sourceLanguage = 'spa',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedText, setSelectedText] = useState<string>('');

  // Handle selection change for Japanese (slide-to-select)
  const handleMouseUp = () => {
    if (sourceLanguage === 'spa') return; // Don't handle mouse selection for Spanish
    
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const selText = selection.toString().trim();
    if (selText && selText.length > 0) {
      setSelectedText(selText);
    }
  };

  // Add or remove selection for Japanese (slide-to-select)
  const handleAddSelection = () => {
    if (!selectedText) return;
    
    // Multi-word selection
    if (selectedText.includes(' ')) {
      // Check if this exact phrase is already selected
      if (selections.includes(selectedText)) {
        onSelectionsChange(selections.filter(s => s !== selectedText));
      } else {
        onSelectionsChange([...selections, selectedText]);
      }
    } else {
      // Single word selection
      if (selections.includes(selectedText)) {
        onSelectionsChange(selections.filter(s => s !== selectedText));
      } else {
        onSelectionsChange([...selections, selectedText]);
      }
    }
    
    setSelectedText('');
    
    // Clear the selection
    window.getSelection()?.removeAllRanges();
  };

  // Handle word click for Spanish (click-to-select)
  const handleWordClick = (word: string, wordIndex: number) => {
    if (sourceLanguage !== 'spa') return; // Only handle word clicks for Spanish
    
    // Create a unique identifier for this specific word instance
    const wordId = `${word}_${wordIndex}`;
    
    // Check if this specific word instance is already selected
    const isSelected = selections.some(sel => sel === wordId);
    
    if (isSelected) {
      // Remove this specific word instance
      onSelectionsChange(selections.filter(sel => sel !== wordId));
    } else {
      // Add this specific word instance
      onSelectionsChange([...selections, wordId]);
    }
  };

  // Split text into words for Spanish interface
  const getWordsForSpanish = () => {
    if (!text) return [];
    
    // Split by spaces but preserve punctuation with words
    const words = text.split(/(\s+)/).filter(part => part.trim().length > 0);
    return words;
  };

  // Render Spanish interface with clickable word buttons
  const renderSpanishInterface = () => {
    const words = getWordsForSpanish();
    
    return (
      <div className={`py-3 px-4 rounded-md ${isSource ? 'bg-blue-50 font-medium' : 'bg-gray-50'} flex flex-wrap gap-1`}>
        {words.map((word, index) => {
          const wordId = `${word}_${index}`;
          const isSelected = selections.some(sel => sel === wordId);
          
          return (
            <button
              key={`${word}-${index}`}
              onClick={() => handleWordClick(word, index)}
              className={`px-2 py-1 rounded transition-all duration-200 ${
                isSelected
                  ? isSource
                    ? 'bg-blue-200 text-blue-900 border border-blue-300 shadow-sm'
                    : 'bg-orange-200 text-orange-900 border border-orange-300 shadow-sm'
                  : 'hover:bg-gray-200 border border-transparent'
              }`}
            >
              {isSelected && isSource ? `{{${word}}}` : isSelected && !isSource ? `**${word}**` : word}
            </button>
          );
        })}
      </div>
    );
  };

  // Highlight the selected text in the display for Japanese
  const getHighlightedTextForJapanese = () => {
    if (!text) return null;
    
    // Create a copy of the text to work with
    let resultJSX = <>{text}</>;
    
    // Only proceed if there are selections
    if (selections.length > 0) {
      // Sort selections by length (descending) to handle overlapping selections
      const sortedSelections = [...selections].sort((a, b) => b.length - a.length);
      
      // Split text into parts with selections highlighted
      let parts: React.ReactNode[] = [text];
      
      for (const selection of sortedSelections) {
        parts = parts.flatMap(part => {
          if (typeof part !== 'string') return [part];
          
          const splitParts = part.split(selection);
          const result: React.ReactNode[] = [];
          
          for (let i = 0; i < splitParts.length; i++) {
            if (i > 0) {
              // Apply the appropriate styling based on whether it's source or translation
              if (isSource) {
                result.push(
                  <span key={`sel-${i}-${selection}`} className="bg-blue-100 text-blue-800 mx-0.5 px-0.5 rounded border border-blue-200">
                    {`{{${selection}}}`}
                  </span>
                );
              } else {
                result.push(
                  <span key={`sel-${i}-${selection}`} className="font-bold text-orange-600 mx-0.5">
                    {selection}
                  </span>
                );
              }
            }
            if (splitParts[i]) {
              result.push(splitParts[i]);
            }
          }
          
          return result;
        });
      }
      
      resultJSX = <>{parts}</>;
    }
    
    return resultJSX;
  };

  // Render Japanese interface with slide-to-select
  const renderJapaneseInterface = () => {
    return (
      <>
        <div 
          ref={containerRef}
          className={`py-3 px-4 rounded-md ${
            isSource ? 'bg-blue-50 font-medium' : 'bg-gray-50'
          }`}
          onMouseUp={handleMouseUp}
        >
          {getHighlightedTextForJapanese()}
        </div>
        
        {selectedText && (
          <div className="absolute right-2 bottom-2 flex space-x-2">
            <button
              onClick={handleAddSelection}
              className={`text-white py-1 px-3 rounded-md text-sm ${
                isSource ? 'bg-blue-500 hover:bg-blue-600' : 'bg-orange-500 hover:bg-orange-600'
              }`}
            >
              {selections.includes(selectedText) ? 'Remove' : 'Select'} "{selectedText}"
            </button>
          </div>
        )}
      </>
    );
  };

  return (
    <div className="relative">
      {sourceLanguage === 'spa' ? renderSpanishInterface() : renderJapaneseInterface()}
    </div>
  );
};

export default SelectableText;