import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileImage } from 'lucide-react';

interface ImageUploadProps {
  onImagesUploaded: (files: File[]) => void;
  isProcessing: boolean;
}

const ImageUpload: React.FC<ImageUploadProps> = ({ onImagesUploaded, isProcessing }) => {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        onImagesUploaded(acceptedFiles);
      }
    },
    [onImagesUploaded]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif'],
    },
    disabled: isProcessing,
    multiple: true,
  });

  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors duration-200 cursor-pointer 
        ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'}
        ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center justify-center space-y-3">
        {isDragActive ? (
          <FileImage className="h-12 w-12 text-blue-500 mb-2" />
        ) : (
          <Upload className="h-12 w-12 text-gray-400 mb-2" />
        )}
        <p className="text-lg font-medium text-gray-700">
          {isDragActive
            ? 'Drop the images here'
            : 'Drag & drop Duolingo images here'}
        </p>
        <p className="text-sm text-gray-500">
          or click to select files
        </p>
        <p className="text-xs text-gray-400 mt-2">
          Supported formats: JPG, PNG, GIF
        </p>
      </div>
    </div>
  );
};

export default ImageUpload;