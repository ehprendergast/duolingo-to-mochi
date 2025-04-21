import React from 'react';
import { ImageProcessingResult } from '../types';
import { Loader2, AlertCircle } from 'lucide-react';

interface ImageProcessingPreviewProps {
  result: ImageProcessingResult;
}

const ImageProcessingPreview: React.FC<ImageProcessingPreviewProps> = ({ result }) => {
  return (
    <div className="border rounded-lg overflow-hidden bg-white shadow-sm mb-4">
      <div className="relative">
        {/* Image preview */}
        <img 
          src={result.imageUrl} 
          alt="Duolingo screenshot" 
          className="w-full object-cover max-h-48"
        />
        
        {/* Processing overlay */}
        {result.isProcessing && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
            <div className="bg-white p-3 rounded-lg flex items-center">
              <Loader2 className="animate-spin mr-2 text-blue-500" size={20} />
              <span className="text-sm font-medium">Processing...</span>
            </div>
          </div>
        )}
        
        {/* Error overlay */}
        {result.error && (
          <div className="absolute inset-0 bg-red-500 bg-opacity-30 flex items-center justify-center">
            <div className="bg-white p-3 rounded-lg flex items-center text-red-600">
              <AlertCircle className="mr-2" size={20} />
              <span className="text-sm font-medium">Error: {result.error}</span>
            </div>
          </div>
        )}
      </div>
      
      {/* OCR Result Preview */}
      {!result.isProcessing && !result.error && result.ocrResult && (
        <div className="p-3">
          <h4 className="text-sm font-medium mb-1 text-gray-700">Detected Text:</h4>
          <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded max-h-32 overflow-y-auto">
            {result.ocrResult.map((line, index) => (
              <p key={index}>{line.text}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageProcessingPreview;