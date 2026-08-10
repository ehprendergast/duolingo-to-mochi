import React, { useState, useRef, useEffect } from 'react';
import { ProcessedTextPair } from '../types';
import { formatTextPairs } from '../utils/formatting';
import { Copy, CheckCircle, Edit2, Check, X, Download, Share2 } from 'lucide-react';

interface FormattedTextOutputProps {
  textPairs: ProcessedTextPair[];
}

const FormattedTextOutput: React.FC<FormattedTextOutputProps> = ({ textPairs }) => {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState('');
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  
  const formattedText = formatTextPairs(textPairs);
  
  const handleCopy = async () => {
    const text = isEditing ? editedText : formattedText;
    try {
      // Modern clipboard API — works best on Android Chrome
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else if (textAreaRef.current) {
        textAreaRef.current.select();
        document.execCommand('copy');
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);

      // Haptic feedback on Android if available
      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }
    } catch (err) {
      // Fallback to old method
      if (textAreaRef.current) {
        textAreaRef.current.select();
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  const handleShare = async () => {
    const text = isEditing ? editedText : formattedText;
    // Web Share API — great for Android Chrome
    if ((navigator as any).share) {
      try {
        await (navigator as any).share({
          title: 'Mochi flashcards',
          text: text,
        });
        return;
      } catch (e) {
        // User cancelled or failed — fallback to copy
      }
    }
    handleCopy();
  };

  const handleStartEditing = () => {
    setEditedText(formattedText);
    setIsEditing(true);
    setTimeout(() => {
      if (textAreaRef.current) {
        textAreaRef.current.focus();
      }
    }, 0);
  };

  const handleSaveEdit = () => {
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
    a.download = `mochi-flashcards-${new Date().toISOString().slice(0,10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Stats
  const totalClozes = textPairs.reduce((sum, p) => sum + p.sourceSelections.length, 0);
  const totalBolds = textPairs.reduce((sum, p) => sum + p.translationSelections.length, 0);
  
  return (
    <div className="border rounded-xl overflow-hidden bg-white shadow-lg mt-4 lg:sticky lg:bottom-4 z-20">
      <div className="border-b px-4 py-3 bg-gradient-to-r from-gray-50 to-white flex justify-between items-center">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-gray-700 text-sm">Mochi Output</h3>
          {textPairs.length > 0 && (
            <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full border">
              {totalClozes} cloze · {totalBolds} bold
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-1.5">
          {isEditing ? (
            <>
              <button
                onClick={handleSaveEdit}
                className="flex items-center px-3 py-2 rounded-lg text-xs bg-green-100 text-green-700 hover:bg-green-200 min-h-[40px]"
                title="Save (Ctrl+Enter)"
              >
                <Check size={14} className="mr-1" />
                Save
              </button>
              <button
                onClick={handleCancelEdit}
                className="flex items-center px-3 py-2 rounded-lg text-xs bg-gray-100 text-gray-700 hover:bg-gray-200 min-h-[40px]"
                title="Cancel (Esc)"
              >
                <X size={14} className="mr-1" />
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleStartEditing}
                className="hidden sm:flex items-center px-2.5 py-2 rounded-lg text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-100 min-h-[40px]"
              >
                <Edit2 size={12} className="mr-1" />
                Edit
              </button>
              <button 
                onClick={handleCopy}
                className={`flex items-center px-3 py-2 rounded-lg text-xs font-medium transition-all min-h-[44px] active:scale-95 ${
                  copied 
                    ? 'bg-green-500 text-white shadow-md' 
                    : 'bg-gray-900 hover:bg-black text-white shadow'
                }`}
              >
                {copied ? (
                  <>
                    <CheckCircle size={14} className="mr-1.5" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy size={14} className="mr-1.5" />
                    Copy
                  </>
                )}
              </button>
              <button
                onClick={handleShare}
                className="sm:hidden flex items-center px-3 py-2 rounded-lg text-xs bg-white text-gray-700 hover:bg-gray-50 border border-gray-200 min-h-[44px] active:scale-95"
                title="Share"
              >
                <Share2 size={14} />
              </button>
              <button
                onClick={handleDownload}
                className="hidden sm:flex items-center px-2.5 py-2 rounded-lg text-xs bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-100 min-h-[40px]"
                title="Download as Markdown"
              >
                <Download size={12} className="mr-1" />
                .md
              </button>
            </>
          )}
        </div>
      </div>
      
      <div className="p-3">
        <textarea
          ref={textAreaRef}
          value={isEditing ? editedText : formattedText}
          onChange={(e) => isEditing && setEditedText(e.target.value)}
          onKeyDown={handleKeyDown}
          className={`w-full h-[260px] sm:h-64 p-3 border rounded-lg font-mono text-[13px] sm:text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent leading-relaxed ${
            !isEditing && 'cursor-text bg-gray-50/50'
          }`}
          placeholder={`# {{blanked}} source sentence with {{{kanji}(yomi)}} 
translation with **bold** hints
-----
# Next card...`}
          readOnly={!isEditing}
          spellCheck={false}
          style={{ tabSize: 2, fontSize: '16px' }} // 16px prevents iOS zoom, but we scale down via CSS for desktop
        />
        
        <div className="mt-2.5 space-y-1.5">
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100 font-mono">
              # {'{{'}word{'}}'} = cloze
            </span>
            <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded border border-purple-100 font-mono">
              {'{{{'}kanji{'}'}({'(yomi)'}){'}}'} = furigana
            </span>
            <span className="bg-orange-50 text-orange-700 px-2 py-0.5 rounded border border-orange-100 font-mono">
              **word** = bold
            </span>
            <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded border">
              ----- = separator
            </span>
          </div>
          
          {copied && (
            <p className="text-xs text-green-600 flex items-center gap-1 animate-in fade-in">
              <CheckCircle size={12} />
              Copied to clipboard! Paste into Mochi (Import → Markdown)
            </p>
          )}
          
          {isEditing && (
            <p className="text-[11px] text-blue-600">
              Shortcuts: <span className="font-mono bg-blue-50 px-1 rounded">Ctrl+Enter</span> save, <span className="font-mono bg-gray-100 px-1 rounded">Esc</span> cancel
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default FormattedTextOutput;
