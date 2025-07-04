import { ProcessedTextPair } from '../types';

/**
 * Formats text pairs according to the required format
 * Adds "# " prefix and separates pairs with ---
 */
export const formatTextPairs = (pairs: ProcessedTextPair[]): string => {
  if (pairs.length === 0) return '';
  
  return pairs
    .map((pair, index) => {
      const formattedSource = formatSourceWithSelections(pair.sourceText, pair.sourceSelections, pair.sourceLanguage);
      const formattedTranslation = formatTranslationWithSelections(
        pair.translationText,
        pair.translationSelections,
        pair.sourceLanguage
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
export const formatSourceWithSelections = (text: string, selections: string[], sourceLanguage: 'spa' | 'jpn'): string => {
  if (!selections.length) return text;
  
  let formattedText = text;
  
  if (sourceLanguage === 'spa') {
    // For Spanish: Handle word-based selections with unique identifiers
    const words = text.split(/(\s+)/).filter(part => part.trim().length > 0);
    
    // Create a map of selected word positions
    const selectedPositions = new Set<number>();
    selections.forEach(selection => {
      const [word, indexStr] = selection.split('_');
      const index = parseInt(indexStr, 10);
      if (!isNaN(index)) {
        selectedPositions.add(index);
      }
    });
    
    // Rebuild the text with selected words wrapped
    formattedText = words.map((word, index) => {
      if (selectedPositions.has(index)) {
        return `{{${word}}}`;
      }
      return word;
    }).join(' ');
  } else {
    // For Japanese: Handle phrase-based selections (existing logic)
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
  }

  // Replace "| " with "I " to fix common OCR error
  formattedText = formattedText.replace(/\| /g, 'I ');
  
  return formattedText;
};

/**
 * Format translation text with selections bolded
 */
export const formatTranslationWithSelections = (text: string, selections: string[], sourceLanguage: 'spa' | 'jpn'): string => {
  if (!selections.length) return text;
  
  let formattedText = text;
  
  if (sourceLanguage === 'spa') {
    // For Spanish: Handle word-based selections with unique identifiers
    const words = text.split(/(\s+)/).filter(part => part.trim().length > 0);
    
    // Create a map of selected word positions
    const selectedPositions = new Set<number>();
    selections.forEach(selection => {
      const [word, indexStr] = selection.split('_');
      const index = parseInt(indexStr, 10);
      if (!isNaN(index)) {
        selectedPositions.add(index);
      }
    });
    
    // Rebuild the text with selected words bolded
    formattedText = words.map((word, index) => {
      if (selectedPositions.has(index)) {
        return `**${word}**`;
      }
      return word;
    }).join(' ');
  } else {
    // For Japanese: Handle phrase-based selections (existing logic)
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
  }
  
  return formattedText;
};

/**
 * Separates the OCR text into source and translation parts based on delimiter punctuation
 */
export const separateTextPairs = (text: string, sourceLanguage: 'spa' | 'jpn'): { sourceText: string; translationText: string } => {
  
  let sourceText = '';
  let translationText = '';

  if (sourceLanguage === 'spa') {
    // Remove line breaks and extra spaces
    let normalizedText = text.replace(/\n/g, ' ').trim();
    // Spanish text processing - keep multiple spaces
    normalizedText = normalizedText
      .replace(/\s+/g, ' ')
      .replace(/\| /g, 'I '); // Replace "| " with "I " to fix common OCR error
    
    // Find all delimiter positions
    const delimiters = [...normalizedText.matchAll(/[.!?]/g)].map(match => match.index);
    
    if (delimiters.length >= 2) {
      if (delimiters.length === 2 || delimiters.length === 3) {
        // Case 1: Two or three delimiters total (one in source, one in translation, potentially one extraneous)
        const firstDelimiterPos = delimiters[0];
        const secondDelimiterPos = delimiters[1];
        
        // Find the space after the first delimiter to separate source and translation
        const textAfterFirstDelimiter = normalizedText.slice(firstDelimiterPos! + 1);
        const firstSpaceAfterDelimiter = textAfterFirstDelimiter.search(/\s/);
        const sourceEndPos = firstDelimiterPos! + firstSpaceAfterDelimiter + 1;
        
        sourceText = normalizedText.slice(0, sourceEndPos).trim();
        translationText = normalizedText.slice(sourceEndPos, secondDelimiterPos! + 1).trim();
      } else {
        // Case 2: Four or more delimiters total (two in source, two in translation, more extraneous)
        const secondDelimiterPos = delimiters[1];
        const fourthDelimiterPos = delimiters[3];
        
        sourceText = normalizedText.slice(0, secondDelimiterPos! + 1).trim();
        translationText = normalizedText.slice(secondDelimiterPos! + 1, fourthDelimiterPos! + 1).trim();
      }
    }
  } else {
    let normalizedText = text.trim();
    // Japanese text processing
    // First, clean up the text by removing unnecessary characters and spaces
    console.log('1. Before Japanese processing:', JSON.stringify(normalizedText));
    console.log('1a. Contains \\n\\n at start?', /^[^\n]*\n\n/.test(normalizedText));
    console.log('1b. Text split by newlines:', normalizedText.split('\n').map((line, i) => `Line ${i}: "${line}"`));
    // First remove the first line followed by double newlines (before normalizing spaces)
    const beforeRemoval = normalizedText;
    normalizedText = normalizedText.replace(/^[^\n]*\n\n/, '');
    console.log('2a. Regex match test:', beforeRemoval.match(/^[^\n]*\n\n/));
    console.log('2b. After removing first line + \\n\\n:', JSON.stringify(normalizedText));
    
    // Then clean up the remaining text
    normalizedText = normalizedText
      .replace(/【/g, '') // Remove 【 characters
      .replace(/】/g, '') // Remove 】 characters
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim();
    console.log('2c. After removing 【】 and normalizing spaces:', JSON.stringify(normalizedText));
    console.log('2. After Japanese processing:', JSON.stringify(normalizedText));
    // Remove line breaks and extra spaces
    normalizedText = normalizedText.replace(/\n/g, ' ').trim();

    // Find the last Japanese sentence by matching everything up to the last Japanese delimiter
    const japanesePattern = /^.*?([^。！？]+[。！？])/;
    const match = normalizedText.match(japanesePattern);

    if (match) {
      // Strip spaces from the Japanese source text
      sourceText = match[1].replace(/\s+/g, '').trim();
      
      // Get everything after the Japanese text for the translation
      const remainingText = normalizedText.slice(match[0].length).trim();
      
      // Find the English translation by looking for sentence ending punctuation
      const translationMatch = remainingText.match(/([^.!?]+[.!?])/);
      
      if (translationMatch) {
        translationText = translationMatch[1].trim();
      }

      // Delete common OCR errors from beginning of Japanese source text
      sourceText = sourceText
        .replace(/^([ぁ-ん])?@/, '') // Remove optional leading hiragana + @ character
        .replace(/^([ぁ-ん])?」/, '') // Remove leading hiragana + 」character
        
    }
  }

  // Fallback if we can't detect proper text pairs
  if (!sourceText || !translationText) {
    return {
      sourceText: '',
      translationText: ''
    };
  }

  return { sourceText, translationText };
};

/**
 * Generates a unique ID
 */
export const generateId = (): string => {
  return Math.random().toString(36).substring(2, 11);
};