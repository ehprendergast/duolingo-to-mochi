import React, { useCallback, useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileImage, Clipboard, Camera } from 'lucide-react';

interface ImageUploadProps {
  onImagesUploaded: (files: File[]) => void;
  isProcessing: boolean;
}

const ImageUpload: React.FC<ImageUploadProps> = ({ onImagesUploaded, isProcessing }) => {
  const [clipboardSupported, setClipboardSupported] = useState(false);
  const [pasteMessage, setPasteMessage] = useState<string | null>(null);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        onImagesUploaded(acceptedFiles);
      }
    },
    [onImagesUploaded]
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
    },
    disabled: isProcessing,
    multiple: true,
    noClick: false,
  });

  // Clipboard paste support — crucial for Android Chrome where screenshots go to clipboard
  useEffect(() => {
    const checkClipboard = async () => {
      try {
        // @ts-ignore
        if (navigator.clipboard && navigator.clipboard.read) {
          setClipboardSupported(true);
        } else {
          // Check for paste event support
          setClipboardSupported(true);
        }
      } catch {
        setClipboardSupported(false);
      }
    };
    checkClipboard();

    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        onImagesUploaded(imageFiles);
        setPasteMessage(`Pasted ${imageFiles.length} image(s) from clipboard!`);
        setTimeout(() => setPasteMessage(null), 3000);
      }
    };

    // Also try reading clipboard via async API on demand
    document.addEventListener('paste', handlePaste as any);
    return () => document.removeEventListener('paste', handlePaste as any);
  }, [onImagesUploaded]);

  const handlePasteFromClipboard = async () => {
    try {
      // @ts-ignore
      const clipboardItems = await navigator.clipboard.read();
      const imageFiles: File[] = [];

      for (const item of clipboardItems) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            const file = new File([blob], `clipboard-${Date.now()}.${type.split('/')[1]}`, { type });
            imageFiles.push(file);
          }
        }
      }

      if (imageFiles.length > 0) {
        onImagesUploaded(imageFiles);
        setPasteMessage(`Pasted ${imageFiles.length} image(s)!`);
        setTimeout(() => setPasteMessage(null), 3000);
      } else {
        setPasteMessage('No image in clipboard — screenshot Duolingo first');
        setTimeout(() => setPasteMessage(null), 3000);
      }
    } catch (err) {
      // Fallback: prompt user to paste with Ctrl+V
      setPasteMessage('Press Ctrl+V (or long-press → Paste) to paste screenshot');
      setTimeout(() => setPasteMessage(null), 4000);
    }
  };

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-6 sm:p-8 text-center transition-all duration-200 cursor-pointer
          ${isDragActive ? 'border-green-500 bg-green-50 scale-[1.01]' : 'border-gray-300 hover:border-green-400 hover:bg-gray-50'}
          ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <input {...getInputProps()} />
        {/* Add camera capture for Android */}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          id="camera-input"
          multiple
          onChange={(e) => {
            const files = e.target.files ? Array.from(e.target.files) : [];
            if (files.length > 0) onImagesUploaded(files);
          }}
        />
        
        <div className="flex flex-col items-center justify-center space-y-3">
          {isDragActive ? (
            <FileImage className="h-12 w-12 text-green-500 mb-2 animate-bounce" />
          ) : (
            <div className="flex gap-2">
              <Upload className="h-10 w-10 text-gray-400" />
              <Camera className="h-6 w-6 text-gray-300 mt-4" />
            </div>
          )}
          <p className="text-base sm:text-lg font-medium text-gray-700">
            {isDragActive
              ? 'Drop the images here'
              : 'Drag & drop Duolingo screenshots'}
          </p>
          <p className="text-sm text-gray-500">
            or tap to select from gallery
          </p>
          
          {/* Mobile action buttons */}
          <div className="flex flex-wrap gap-2 justify-center pt-2">
            <label
              htmlFor="camera-input"
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-full text-xs font-medium text-gray-700 hover:bg-gray-50 active:scale-95 transition-all cursor-pointer min-h-[40px]"
            >
              <Camera size={14} />
              Camera
            </label>
            
            {clipboardSupported && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handlePasteFromClipboard();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-full text-xs font-medium text-gray-700 hover:bg-gray-50 active:scale-95 transition-all min-h-[40px]"
                type="button"
              >
                <Clipboard size={14} />
                Paste
              </button>
            )}
          </div>

          <p className="text-[11px] text-gray-400 mt-2 max-w-[280px]">
            Works with Duolingo screenshots, textbook photos, ebook passages • JPG, PNG, WEBP
          </p>
        </div>
      </div>

      {pasteMessage && (
        <div className="bg-blue-50 border border-blue-200 text-blue-700 text-xs px-3 py-2 rounded-lg text-center animate-in fade-in">
          {pasteMessage}
        </div>
      )}
    </div>
  );
};

export default ImageUpload;
