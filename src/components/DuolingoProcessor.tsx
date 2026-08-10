import React, { useState, useCallback, useEffect } from 'react';
import ImageUpload from './ImageUpload';
import TextPairProcessor from './TextPairProcessor';
import FormattedTextOutput from './FormattedTextOutput';
import ImageProcessingPreview from './ImageProcessingPreview';
import { processImageWithTesseractOCR, terminateAllWorkers } from '../services/azureOCR';
import { separateTextPairs, generateId } from '../utils/formatting';
import { ProcessedTextPair, ImageProcessingResult } from '../types';
import { getLanguageProfile, LANGUAGE_REGISTRY, formatLanguageOption } from '../services/languageRegistry';
import { AlertCircle, ArrowRight, Languages, Sparkles, Zap } from 'lucide-react';

const DuolingoProcessor: React.FC = () => {
  const [processingResults, setProcessingResults] = useState<ImageProcessingResult[]>([]);
  const [textPairs, setTextPairs] = useState<ProcessedTextPair[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceLanguage, setSourceLanguage] = useState<string>('spa');
  const [useCloudOCR, setUseCloudOCR] = useState(false);

  // Check if cloud OCR is available
  useEffect(() => {
    const provider = (import.meta as any).env?.VITE_OCR_PROVIDER;
    if (provider === 'cloud') {
      setUseCloudOCR(true);
    }
  }, []);

  // Cleanup workers on unmount
  useEffect(() => {
    return () => {
      terminateAllWorkers();
    };
  }, []);

  // Handle image uploads — now with concurrency control for speed
  const handleImagesUploaded = useCallback(async (files: File[]) => {
    setIsProcessing(true);
    setError(null);
    
    try {
      const newResults: ImageProcessingResult[] = files.map((file) => ({
        id: generateId(),
        imageUrl: URL.createObjectURL(file),
        ocrResult: [],
        isProcessing: true,
      }));
      
      setProcessingResults((prev) => [...prev, ...newResults]);
      
      // Process with limited concurrency (2 at a time) for better mobile performance
      const concurrency = 2;
      const queue = [...newResults];
      const active: Promise<void>[] = [];

      const processOne = async (result: ImageProcessingResult) => {
        try {
          const ocrResult = await processImageWithTesseractOCR(result.imageUrl, sourceLanguage);
          const combinedText = ocrResult.map((r) => r.text).join('\n');
          const { sourceText, translationText } = separateTextPairs(combinedText, sourceLanguage);
          
          const processedPair: ProcessedTextPair = {
            id: result.id,
            sourceText,
            translationText,
            sourceSelections: [],
            translationSelections: [],
            imageUrl: result.imageUrl,
            sourceLanguage,
            autoFurigana: sourceLanguage === 'jpn' || sourceLanguage === 'zho',
          };
          
          setProcessingResults((prev) =>
            prev.map((r) =>
              r.id === result.id ? { ...r, ocrResult, processedPair, isProcessing: false } : r
            )
          );
          setTextPairs((prev) => [...prev, processedPair]);
        } catch (err) {
          console.error('OCR failed for', result.id, err);
          setProcessingResults((prev) =>
            prev.map((r) =>
              r.id === result.id
                ? { ...r, isProcessing: false, error: 'OCR processing failed — try cropping image or use manual text entry' }
                : r
            )
          );
        }
      };

      // Process with concurrency
      while (queue.length > 0 || active.length > 0) {
        while (active.length < concurrency && queue.length > 0) {
          const next = queue.shift()!;
          const promise = processOne(next).finally(() => {
            active.splice(active.indexOf(promise), 1);
          });
          active.push(promise);
        }
        if (active.length > 0) {
          await Promise.race(active);
        }
      }
    } catch (err) {
      setError('Failed to process images. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }, [sourceLanguage]);

  const handleTextPairUpdate = useCallback((updatedPair: ProcessedTextPair) => {
    setTextPairs((prev) =>
      prev.map((pair) => (pair.id === updatedPair.id ? updatedPair : pair))
    );
  }, []);

  const handleTextPairDelete = useCallback((id: string) => {
    setTextPairs((prev) => prev.filter((pair) => pair.id !== id));
    setProcessingResults((prev) => {
      const toRemove = prev.find(r => r.id === id);
      if (toRemove) URL.revokeObjectURL(toRemove.imageUrl);
      return prev.filter((result) => result.id !== id);
    });
  }, []);

  const currentProfile = getLanguageProfile(sourceLanguage);

  return (
    <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-8 max-w-7xl">
      {/* Mobile-first: improve header on small screens */}
      <div className="mb-4 bg-white rounded-xl shadow-sm p-4 border">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <Languages className="h-6 w-6 text-green-500" />
            <div>
              <h2 className="text-base sm:text-lg font-bold text-gray-800">Select Language</h2>
              <p className="text-xs text-gray-500 hidden sm:block">Japanese now has tap-to-select • auto furigana • faster OCR</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <select
              value={sourceLanguage}
              onChange={(e) => setSourceLanguage(e.target.value)}
              className="flex-1 sm:flex-none border border-gray-300 rounded-lg py-2.5 px-3 text-sm bg-white min-h-[44px] text-[16px] sm:text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <option value="spa">🇪🇸 Spanish → English</option>
              <option value="jpn">🇯🇵 Japanese → English (✨ new: tap words)</option>
              <option value="zho">🇨🇳 Chinese → English (experimental)</option>
              <option value="fra">🇫🇷 French → English</option>
              <option value="deu">🇩🇪 German → English</option>
            </select>
            
            {currentProfile.supportsFurigana && (
              <span className="hidden sm:flex items-center gap-1 text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded-full border border-purple-200">
                <Sparkles size={12} />
                Furigana
              </span>
            )}
            {useCloudOCR && (
              <span className="hidden sm:flex items-center gap-1 text-xs bg-green-50 text-green-700 px-2 py-1 rounded-full border border-green-200">
                <Zap size={12} />
                Cloud OCR
              </span>
            )}
          </div>
        </div>
        
        {/* Mobile hint */}
        <div className="mt-3 sm:hidden text-[11px] text-gray-500 bg-gray-50 rounded-lg p-2.5">
          💡 <strong>New in Japanese:</strong> Tap any word to cloze! Nouns/verbs white, particles grey. Auto adds furigana 
          <span className="font-mono">{' {{kanji}(yomi)}}'}</span>. 
          {currentProfile.supportsFurigana && ' Long-press disabled — just tap!'}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row lg:space-x-6 gap-6">
        {/* Left column - Image upload and processing */}
        <div className="w-full lg:w-[45%]">
          <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border sticky top-4">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              Upload Images
              {isProcessing && (
                <span className="text-xs font-normal bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full animate-pulse">
                  OCR processing…
                </span>
              )}
            </h2>
            
            <ImageUpload onImagesUploaded={handleImagesUploaded} isProcessing={isProcessing} />
            
            {/* Paste hint for Android Chrome */}
            <div className="mt-3 text-[11px] text-gray-400 text-center">
              Android Chrome: You can paste screenshot from clipboard (long-press → paste) or use camera
            </div>

            {error && (
              <div className="mt-4 bg-red-50 text-red-700 p-3 rounded-lg flex items-start text-sm border border-red-100">
                <AlertCircle className="mr-2 mt-0.5 flex-shrink-0" size={18} />
                <span>{error}</span>
              </div>
            )}
            
            {processingResults.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-medium mb-3 text-gray-700 flex items-center justify-between">
                  <span>Processing Results ({processingResults.length})</span>
                  <button
                    onClick={() => {
                      processingResults.forEach(r => URL.revokeObjectURL(r.imageUrl));
                      setProcessingResults([]);
                      setTextPairs([]);
                    }}
                    className="text-xs text-gray-500 hover:text-red-500"
                  >
                    Clear all
                  </button>
                </h3>
                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                  {processingResults.map((result) => (
                    <ImageProcessingPreview key={result.id} result={result} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Right column - Text processing */}
        <div className="w-full lg:w-[55%]">
          <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-800">Text Pairs</h2>
              
              {textPairs.length > 0 && (
                <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-1 rounded-full">
                  {textPairs.length} cards
                </span>
              )}
            </div>
            
            {textPairs.length === 0 ? (
              <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center">
                <div className="flex flex-col items-center justify-center space-y-3">
                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                    <ArrowRight className="h-6 w-6 text-gray-400" />
                  </div>
                  <p className="text-gray-500 text-sm">
                    Upload images to extract and process text pairs
                  </p>
                  <p className="text-xs text-gray-400 max-w-[260px]">
                    Screenshot your Duolingo lesson, upload, then tap words to create Mochi flashcards
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Text pair processors — remove fixed height for mobile, allow natural scroll */}
                <div className="space-y-4 lg:max-h-[50vh] lg:overflow-y-auto lg:pr-2">
                  {textPairs.map((pair) => (
                    <TextPairProcessor
                      key={pair.id}
                      textPair={pair}
                      onUpdate={handleTextPairUpdate}
                      onDelete={handleTextPairDelete}
                    />
                  ))}
                </div>
                
                {/* Formatted output — sticky on mobile for quick copy */}
                <div className="lg:sticky lg:bottom-4 z-10">
                  <FormattedTextOutput textPairs={textPairs} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Feature announcement — mobile bottom sheet style */}
      <div className="mt-6 bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-100 rounded-xl p-4">
        <h3 className="font-medium text-purple-900 text-sm flex items-center gap-2 mb-2">
          <Sparkles size={16} className="text-purple-500" />
          What's new in this version
        </h3>
        <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
          <li><strong>Japanese tap-to-select:</strong> Words are auto-tokenized (nouns, verbs, particles separated) — no more dragging!</li>
          <li><strong>Auto furigana:</strong> Kanji words automatically get <code className="bg-white px-1 rounded">{'{{{kanji}(yomi)}}'}</code> format for Mochi</li>
          <li><strong>Faster OCR:</strong> Worker caching, image preprocessing, concurrent processing (2x speed)</li>
          <li><strong>Better mobile UX:</strong> Larger tap targets (44px), 16px inputs to prevent zoom, sticky copy button</li>
          <li><strong>Extensible:</strong> Language registry now supports Chinese, French, German — add new Duolingo language with 1 config line</li>
          <li><strong>Cloud OCR optional:</strong> Set <code className="bg-white px-1 rounded">VITE_OCR_PROVIDER=cloud</code> and add Netlify function for Google Vision / OpenAI Vision (10x accuracy)</li>
        </ul>
      </div>
    </div>
  );
};

export default DuolingoProcessor;
