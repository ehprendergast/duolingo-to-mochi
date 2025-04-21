import React, { useState, useEffect } from 'react';
import { ProcessedTextPair } from '../types';
import SelectableText from './SelectableText';
import { Trash2, Edit2, Check, X } from 'lucide-react';

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
  const [isEditing, setIsEditing] = useState(false);
  const [editedSource, setEditedSource] = useState(textPair.sourceText);
  const [editedTranslation, setEditedTranslation] = useState(textPair.translationText);

  // Update parent component when selections change
  useEffect(() => {
    if (!isEditing) {
      onUpdate({
        ...textPair,
        sourceSelections,
        translationSelections
      });
    }
  }, [sourceSelections, translationSelections, textPair, onUpdate, isEditing]);

  const handleSaveEdit = () => {
    onUpdate({
      ...textPair,
      sourceText: editedSource,
      translationText: editedTranslation,
      sourceSelections: [],
      translationSelections: []
    });
    setSourceSelections([]);
    setTranslationSelections([]);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditedSource(textPair.sourceText);
    setEditedTranslation(textPair.translationText);
    setIsEditing(false);
  };

  return (
    <div className="border rounded-lg overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow duration-200 mb-4">
      <div className="border-b px-4 py-3 bg-gray-50 flex justify-between items-center">
        <h3 className="font-medium text-gray-700">Text Pair #{textPair.id.slice(-4)}</h3>
        
        <div className="flex items-center space-x-2">
          {isEditing ? (
            <>
              <button
                onClick={handleSaveEdit}
                className="text-green-600 hover:text-green-700 transition-colors p-1 rounded-full hover:bg-green-50"
                aria-label="Save edits"
              >
                <Check size={18} />
              </button>
              <button
                onClick={handleCancelEdit}
                className="text-gray-400 hover:text-gray-500 transition-colors p-1 rounded-full hover:bg-gray-100"
                aria-label="Cancel edits"
              >
                <X size={18} />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setIsEditing(true)}
                className="text-blue-500 hover:text-blue-600 transition-colors p-1 rounded-full hover:bg-blue-50"
                aria-label="Edit text pair"
              >
                <Edit2 size={18} />
              </button>
              <button 
                onClick={() => onDelete(textPair.id)}
                className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded-full hover:bg-red-50"
                aria-label="Delete text pair"
              >
                <Trash2 size={18} />
              </button>
            </>
          )}
        </div>
      </div>
      
      <div className="p-4 space-y-4">
        {/* Source Text (Spanish) */}
        <div>
          <div className="flex items-center mb-2">
            <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5 rounded">Source Text</span>
            <span className="text-xs text-gray-500 ml-2">Select words to {'{{blank out}}'}</span>
          </div>
          {isEditing ? (
            <textarea
              value={editedSource}
              onChange={(e) => setEditedSource(e.target.value)}
              className="w-full p-3 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={2}
            />
          ) : (
            <SelectableText 
              text={textPair.sourceText} 
              selections={sourceSelections}
              onSelectionsChange={setSourceSelections}
              isSource={true}
            />
          )}
        </div>
        
        {/* Translation Text (English) */}
        <div>
          <div className="flex items-center mb-2">
            <span className="bg-orange-100 text-orange-800 text-xs font-medium px-2 py-0.5 rounded">Translation</span>
            <span className="text-xs text-gray-500 ml-2">Select words to <strong>bold</strong></span>
          </div>
          {isEditing ? (
            <textarea
              value={editedTranslation}
              onChange={(e) => setEditedTranslation(e.target.value)}
              className="w-full p-3 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={2}
            />
          ) : (
            <SelectableText 
              text={textPair.translationText} 
              selections={translationSelections}
              onSelectionsChange={setTranslationSelections}
              isSource={false}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default TextPairProcessor;