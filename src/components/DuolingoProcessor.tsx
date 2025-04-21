import React, { useState, useCallback } from 'react';
import ImageUpload from './ImageUpload';
import TextPairProcessor from './TextPairProcessor';
import FormattedTextOutput from './FormattedTextOutput';
import ImageProcessingPreview from './ImageProcessingPreview';
import { processImageWithAzureOCR } from '../services/azureOCR';
import { separateTextPairs, generateId } from '../utils/formatting';
import { ProcessedTextPair, ImageProcessingResult } from '../types';
import { AlertCircle, ArrowRight, Languages } from 'lucide-react';

const DuolingoProcessor: React.FC = () => {
  const [processingResults, setProcessingResults] = useState<ImageProcessingResult[]>([]);
  const [textPairs, setTextPairs] = useState<ProcessedTextPair[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceLanguage, setSourceLanguage] = useState<'spa' | 'jpn'>('spa');

  // Handle image uploads
  const handleImagesUploaded = useCallback(async (files: File[]) => {
    setIsProcessing(true);
    setError(null);
    
    try {
      // Create URLs for the uploaded images
      const newResults: ImageProcessingResult[] = files.map((file) => ({
        id: generateId(),
        imageUrl: URL.createObjectURL(file),
        ocrResult: [],
        isProcessing: true,
      }));
      
      setProcessingResults((prev) => [...prev, ...newResults]);
      
      // Process each image one by one
      for (const result of newResults) {
        try {
          // Call OCR service with selected language
          const ocrResult = await processImageWithAzureOCR(result.imageUrl, sourceLanguage);
          
          // Combine OCR lines into a single text
          const combinedText = ocrResult.map((r) => r.text).join('\n');
          
          // Separate source and translation
          const { sourceText, translationText } = separateTextPairs(combinedText, sourceLanguage);
          
          // Create processed pair
          const processedPair: ProcessedTextPair = {
            id: result.id,
            sourceText,
            translationText,
            sourceSelections: [],
            translationSelections: [],
            imageUrl: result.imageUrl,
            sourceLanguage
          };
          
          // Update results
          setProcessingResults((prev) =>
            prev.map((r) =>
              r.id === result.id ? { ...r, ocrResult, processedPair, isProcessing: false } : r
            )
          );
          
          // Add to text pairs
          setTextPairs((prev) => [...prev, processedPair]);
        } catch (err) {
          setProcessingResults((prev) =>
            prev.map((r) =>
              r.id === result.id
                ? { ...r, isProcessing: false, error: 'OCR processing failed' }
                : r
            )
          );
        }
      }
    } catch (err) {
      setError('Failed to process images');
    } finally {
      setIsProcessing(false);
    }
  }, [sourceLanguage]);

  // Update a text pair when selections change
  const handleTextPairUpdate = useCallback((updatedPair: ProcessedTextPair) => {
    setTextPairs((prev) =>
      prev.map((pair) => (pair.id === updatedPair.id ? updatedPair : pair))
    );
  }, []);

  // Delete a text pair
  const handleTextPairDelete = useCallback((id: string) => {
    setTextPairs((prev) => prev.filter((pair) => pair.id !== id));
    setProcessingResults((prev) => prev.filter((result) => result.id !== id));
  }, []);

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="flex flex-col md:flex-row md:space-x-6">
        {/* Left column - Image upload and processing */}
        <div className="w-full md:w-1/2 mb-6 md:mb-0">
          <div className="bg-white p-6 rounded-lg shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-800">Upload Duolingo Images</h2>
              <div className="flex items-center space-x-2">
                <Languages className="h-5 w-5 text-gray-500" />
                <select
                  value={sourceLanguage}
                  onChange={(e) => setSourceLanguage(e.target.value as 'spa' | 'jpn')}
                  className="border rounded-md py-1 px-2 text-sm bg-white"
                >
                  <option value="spa">Spanish → English</option>
                  <option value="jpn">Japanese → English</option>
                </select>
              </div>
            </div>
            
            <ImageUpload onImagesUploaded={handleImagesUploaded} isProcessing={isProcessing} />
            
            {error && (
              <div className="mt-4 bg-red-50 text-red-700 p-3 rounded-md flex items-start">
                <AlertCircle className="mr-2 mt-0.5 flex-shrink-0" size={18} />
                <span>{error}</span>
              </div>
            )}
            
            {processingResults.length > 0 && (
              <div className="mt-6">
                <h3 className="text-lg font-medium mb-3 text-gray-700">Processing Results</h3>
                <div className="space-y-3">
                  {processingResults.map((result) => (
                    <ImageProcessingPreview key={result.id} result={result} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Right column - Text processing */}
        <div className="w-full md:w-1/2">
          <div className="bg-white p-6 rounded-lg shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-800">Text Processing</h2>
              
              {textPairs.length > 0 && (
                <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded">
                  {textPairs.length} Text Pairs
                </span>
              )}
            </div>
            
            {textPairs.length === 0 ? (
              <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center">
                <div className="flex flex-col items-center justify-center space-y-2">
                  <ArrowRight className="h-8 w-8 text-gray-300 transform -rotate-90 md:rotate-0" />
                  <p className="text-gray-500">
                    Upload images to extract and process text pairs
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Text pair processors */}
                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                  {textPairs.map((pair) => (
                    <TextPairProcessor
                      key={pair.id}
                      textPair={pair}
                      onUpdate={handleTextPairUpdate}
                      onDelete={handleTextPairDelete}
                    />
                  ))}
                </div>
                
                {/* Formatted output */}
                <FormattedTextOutput textPairs={textPairs} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DuolingoProcessor;