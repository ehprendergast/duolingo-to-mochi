import { ProcessedTextPair } from '../types';

/**
 * Formats text pairs according to the required format
 * Adds "# " prefix and separates pairs with ---
 */
export const formatTextPairs = (pairs: ProcessedTextPair[]): string => {
  if (pairs.length === 0) return '';
  
  return pairs
    .map((pair, index) => {
      const formattedSource = formatSourceWithSelections(pair.sourceText, pair.sourceSelections);
      const formattedTranslation = formatTranslationWithSelections(
        pair.translationText,
        pair.translationSelections
      );
      
      const pairText = `# ${formattedSource}\n${formattedTranslation}`;
      
      // Add delimiter after every pair except the last one
      return index === pairs.length - 1 ? pairText : `${pairText}\n-----`;
    })
    .join('\n');  // Changed from '\n\n' to '\n' to fix spacing
};

/**
 * Format source text with selections wrapped in {{}}
 */
export const formatSourceWithSelections = (text: string, selections: string[]): string => {
  if (!selections.length) return text;
  
  let formattedText = text;
  // Sort selections by length (descending) to handle overlapping selections properly
  const sortedSelections = [...selections].sort((a, b) => b.length - a.length);
  
  for (const selection of sortedSelections) {
    // Escape special regex characters in the selection
    const escapedSelection = selection.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    formattedText = formattedText.replace(
      new RegExp(escapedSelection, 'g'),
      `{{${selection}}}`
    );
  }
  
  return formattedText;
};

/**
 * Format translation text with selections bolded
 */
export const formatTranslationWithSelections = (text: string, selections: string[]): string => {
  if (!selections.length) return text;
  
  let formattedText = text;
  // Sort selections by length (descending) to handle overlapping selections properly
  const sortedSelections = [...selections].sort((a, b) => b.length - a.length);
  
  for (const selection of sortedSelections) {
    // Escape special regex characters in the selection
    const escapedSelection = selection.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    formattedText = formattedText.replace(
      new RegExp(escapedSelection, 'g'),
      `**${selection}**`
    );
  }
  
  return formattedText;
};

/**
 * Separates the OCR text into source and translation parts based on delimiter punctuation
 */
export const separateTextPairs = (text: string, sourceLanguage: 'spa' | 'jpn'): { sourceText: string; translationText: string } => {
  // Remove line breaks and extra spaces
  let normalizedText = text.replace(/\n/g, ' ').trim();
  
  if (sourceLanguage === 'spa') {
    // Spanish text processing - keep multiple spaces
    normalizedText = normalizedText.replace(/\s+/g, ' ');
    
    // Find all delimiter positions
    const delimiters = [...normalizedText.matchAll(/[.!?]/g)].map(match => match.index);
    
    if (delimiters.length === 0) {
      return { sourceText: '', translationText: '' };
    }
    
    // Case 1: Two delimiters total (one in source, one in translation)
    if (delimiters.length === 2) {
      const firstDelimiterPos = delimiters[0];
      const secondDelimiterPos = delimiters[1];
      
      // Find the space after the first delimiter to separate source and translation
      const textAfterFirstDelimiter = normalizedText.slice(firstDelimiterPos! + 1);
      const firstSpaceAfterDelimiter = textAfterFirstDelimiter.search(/\s/);
      const sourceEndPos = firstDelimiterPos! + firstSpaceAfterDelimiter + 1;
      
      const sourceText = normalizedText.slice(0, sourceEndPos).trim();
      const translationText = normalizedText.slice(sourceEndPos, secondDelimiterPos! + 1).trim();
      
      return { sourceText, translationText };
    }
    
    // Case 2: Four delimiters total (two in source, two in translation)
    if (delimiters.length >= 4) {
      const secondDelimiterPos = delimiters[1];
      const fourthDelimiterPos = delimiters[3];
      
      const sourceText = normalizedText.slice(0, secondDelimiterPos! + 1).trim();
      const translationText = normalizedText.slice(secondDelimiterPos! + 1, fourthDelimiterPos! + 1).trim();
      
      return { sourceText, translationText };
    }
  } else {
    // Japanese text processing
    // Remove the 【 character if it exists at the start
    normalizedText = normalizedText.replace(/^【/, '');
    
    // Remove all spaces for Japanese source text
    const noSpacesText = normalizedText.replace(/\s+/g, '');
    
    // Find the first occurrence of a Japanese delimiter
    const delimiterMatch = noSpacesText.match(/[。！？]/);
    
    if (delimiterMatch) {
      const delimiterPos = delimiterMatch.index!;
      const sourceText = noSpacesText.slice(0, delimiterPos + 1);
      
      // Find the English translation after the delimiter
      const afterDelimiter = normalizedText.slice(normalizedText.indexOf(delimiterMatch[0]) + 1);
      const translationMatch = afterDelimiter.match(/([^。！？]+[.!?])/);
      
      if (translationMatch) {
        const translationText = translationMatch[0].trim();
        return { sourceText, translationText };
      }
    }
  }
  
  // Fallback if we can't detect proper text pairs
  return {
    sourceText: '',
    translationText: ''
  };
};

/**
 * Generates a unique ID
 */
export const generateId = (): string => {
  return Math.random().toString(36).substring(2, 11);
};