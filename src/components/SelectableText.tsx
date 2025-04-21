import React, { useState, useEffect, useRef } from 'react';

interface SelectableTextProps {
  text: string;
  selections: string[];
  onSelectionsChange: (selections: string[]) => void;
  isSource: boolean;
}

const SelectableText: React.FC<SelectableTextProps> = ({
  text,
  selections,
  onSelectionsChange,
  isSource,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedText, setSelectedText] = useState<string>('');

  // Handle selection change
  const handleMouseUp = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const selText = selection.toString().trim();
    if (selText && selText.length > 0) {
      setSelectedText(selText);
    }
  };

  // Add or remove selection
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

  // Highlight the selected text in the display
  const getHighlightedText = () => {
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

  return (
    <div className="relative">
      <div 
        ref={containerRef}
        className={`py-3 px-4 rounded-md ${
          isSource ? 'bg-blue-50 font-medium' : 'bg-gray-50'
        }`}
        onMouseUp={handleMouseUp}
      >
        {getHighlightedText()}
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
    </div>
  );
};

export default SelectableText;