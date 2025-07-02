import React from 'react';

interface ClickableWordTextProps {
  text: string;
  selections: string[];
  onSelectionsChange: (selections: string[]) => void;
  isSource: boolean;
}

const ClickableWordText: React.FC<ClickableWordTextProps> = ({
  text,
  selections,
  onSelectionsChange,
  isSource,
}) => {
  // Split text into words while preserving punctuation
  const getWordsWithPunctuation = (text: string) => {
    // Split by spaces but keep punctuation attached to words
    return text.split(/\s+/).filter(word => word.length > 0);
  };

  const words = getWordsWithPunctuation(text);

  const toggleWordSelection = (word: string) => {
    if (selections.includes(word)) {
      onSelectionsChange(selections.filter(s => s !== word));
    } else {
      onSelectionsChange([...selections, word]);
    }
  };

  const isWordSelected = (word: string) => {
    return selections.includes(word);
  };

  return (
    <div className={`py-3 px-4 rounded-md ${
      isSource ? 'bg-blue-50 font-medium' : 'bg-gray-50'
    }`}>
      <div className="flex flex-wrap gap-1">
        {words.map((word, index) => {
          const isSelected = isWordSelected(word);
          
          return (
            <button
              key={`${word}-${index}`}
              onClick={() => toggleWordSelection(word)}
              className={`px-2 py-1 rounded transition-all duration-200 text-sm ${
                isSelected
                  ? isSource
                    ? 'bg-blue-200 text-blue-900 border border-blue-300 shadow-sm'
                    : 'bg-orange-200 text-orange-900 border border-orange-300 shadow-sm'
                  : 'hover:bg-gray-200 text-gray-700 border border-transparent'
              }`}
            >
              {isSelected && isSource ? `{{${word}}}` : isSelected && !isSource ? `**${word}**` : word}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ClickableWordText;