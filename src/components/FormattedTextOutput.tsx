import React, { useState, useRef } from 'react';
import { ProcessedTextPair } from '../types';
import { formatTextPairs } from '../utils/formatting';
import { Copy, CheckCircle, Edit2, Check, X, Download } from 'lucide-react';

interface FormattedTextOutputProps {
  textPairs: ProcessedTextPair[];
}

const FormattedTextOutput: React.FC<FormattedTextOutputProps> = ({ textPairs }) => {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState('');
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  
  const formattedText = formatTextPairs(textPairs);
  
  const handleCopy = () => {
    if (textAreaRef.current) {
      textAreaRef.current.select();
      document.execCommand('copy');
      setCopied(true);
      
      // Reset copied state after 2 seconds
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    }
  };

  const handleStartEditing = () => {
    setEditedText(formattedText);
    setIsEditing(true);
    // Focus and select all text when starting to edit
    setTimeout(() => {
      if (textAreaRef.current) {
        textAreaRef.current.focus();
        textAreaRef.current.setSelectionRange(0, formattedText.length);
      }
    }, 0);
  };

  const handleSaveEdit = () => {
    // Here you could add logic to parse the edited text back into text pairs
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditedText(formattedText);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      handleCancelEdit();
    } else if (e.key === 'Enter' && e.ctrlKey) {
      handleSaveEdit();
    }
  };

  const handleDownload = () => {
    const text = isEditing ? editedText : formattedText;
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'duolingo-text-pairs.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  return (
    <div className="border rounded-lg overflow-hidden bg-white shadow mt-4">
      <div className="border-b px-4 py-3 bg-gray-50 flex justify-between items-center">
        <h3 className="font-medium text-gray-700">Formatted Output</h3>
        
        <div className="flex items-center space-x-2">
          {isEditing ? (
            <>
              <button
                onClick={handleSaveEdit}
                className="flex items-center px-3 py-1 rounded text-sm bg-green-100 text-green-700 hover:bg-green-200"
                title="Save (Ctrl+Enter)"
              >
                <Check size={16} className="mr-1" />
                Save
              </button>
              <button
                onClick={handleCancelEdit}
                className="flex items-center px-3 py-1 rounded text-sm bg-gray-100 text-gray-700 hover:bg-gray-200"
                title="Cancel (Esc)"
              >
                <X size={16} className="mr-1" />
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleStartEditing}
                className="flex items-center px-3 py-1 rounded text-sm bg-blue-100 text-blue-700 hover:bg-blue-200"
              >
                <Edit2 size={16} className="mr-1" />
                Edit
              </button>
              <button 
                onClick={handleCopy}
                className={`flex items-center px-3 py-1 rounded text-sm transition-colors ${
                  copied 
                    ? 'bg-green-100 text-green-700' 
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >
                {copied ? (
                  <>
                    <CheckCircle size={16} className="mr-1" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy size={16} className="mr-1" />
                    Copy
                  </>
                )}
              </button>
              <button
                onClick={handleDownload}
                className="flex items-center px-3 py-1 rounded text-sm bg-purple-100 text-purple-700 hover:bg-purple-200"
                title="Download as Markdown"
              >
                <Download size={16} className="mr-1" />
                Download .md
              </button>
            </>
          )}
        </div>
      </div>
      
      <div className="p-4">
        <textarea
          ref={textAreaRef}
          value={isEditing ? editedText : formattedText}
          onChange={(e) => isEditing && setEditedText(e.target.value)}
          onKeyDown={handleKeyDown}
          className={`w-full h-64 p-3 border rounded-md font-mono text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
            !isEditing && 'cursor-text'
          }`}
          placeholder="Processed text will appear here..."
          readOnly={!isEditing}
          spellCheck={false}
          style={{ tabSize: 2 }}
        />
        
        <div className="mt-2 text-xs text-gray-500">
          <p>Format: <span className="font-mono"># SourceText &#123;&#123;selected words blanked&#125;&#125;</span></p>
          <p><span className="font-mono">TranslationText with **selected words** in bold</span></p>
          {isEditing && (
            <p className="mt-1 text-blue-600">
              Keyboard shortcuts: <span className="font-mono">Ctrl+Enter</span> to save, <span className="font-mono">Esc</span> to cancel
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default FormattedTextOutput;