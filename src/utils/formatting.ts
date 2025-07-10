import { ProcessedTextPair } from '../types';

/**
 * Formats text pairs according to the required format
 * Adds "# " prefix and separates pairs with -----
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
  formattedText = formattedText
    .replace(/\| /g, 'I ')
    .trim();
  
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
    
    // First remove the first line followed by double newlines (before normalizing spaces)
    const beforeRemoval = normalizedText;
    normalizedText = normalizedText.replace(/^[^\n]*\n\n/, '');
    
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
    const japanesePattern = /^.*?([^。！？!?]+[。！？!?])/;
    const match = normalizedText.match(japanesePattern);

    if (match) {
      sourceText = match[1]
        .replace(/!/g, '！') // Replace Western exclamation mark with Japanese
        .replace(/\?/g, '？') // Replace Western question mark with Japanese
        .replace(/\s+/g, '') // Strip spaces from the Japanese source text
        .trim();
      
      // Get everything after the Japanese text for the translation
      const remainingText = normalizedText.slice(match[0].length).trim();
      
      // Find the English translation by looking for sentence ending punctuation
      const translationMatch = remainingText.match(/([^.!?]+[.!?])/);
      
      if (translationMatch) {
        translationText = translationMatch[1]
          .replace(/^l/, 'I ')
          .replace(/^1/, 'I ')
          .replace(/^I s/, 'Is')
          .replace(/^I m/, "I'm")
          .replace(/^I n/, 'In')
          .trim();
      }

      // Delete common OCR errors from beginning of Japanese source text
      sourceText = sourceText
        .replace(/^([ぁ-ん])?@/, '') // Remove optional leading hiragana + @ character
        .replace(/^([ぁ-ん])?」/, '') // Remove leading hiragana + 」character
        
    }
  }

  // Remove common OCR errors from translation text with contractions in English
  translationText = translationText
  .replace(/I\s?m\s/g, "I'm ")
  .replace(/I\s?ll\s/g, "I'll ")
  .replace(/I\s?ve\s/g, "I've ")
  .replace(/I\s?d\s/g, "I'd ")
  .replace(/(?<!\.)\sL/g, ' l') // Correct problems with capitalized 'Love' in middle of sentence
  .replace(/You\s?re\s/g, "You're ")
  .replace(/You\s?ve\s/g, "You've ")
  .replace(/You\s?ll\s/g, "You'll")
  .replace(/You\s?d\s/g, "You'd ")
  .replace(/\syou\s?re\s/g, " you're ")
  .replace(/\syou\s?ve\s/g, " you've ")
  .replace(/\syou\s?ll\s/g, " you'll ")
  .replace(/\syou\s?d\s/g, " you'd ")
  .replace(/He\s?s\s/g, "He's ")
  .replace(/He\s?d\s/g, "He'd ")
  .replace(/He\s?ll\s/g, "He'll ")
  .replace(/\she\s?s\s/g, " he's ")
  .replace(/\she\s?d\s/g, " he'd ")
  .replace(/\she\s?ll\s/g, " he'll ")
  .replace(/She\s?s\s/g, "She's ")
  .replace(/She\s?d\s/g, "She'd ")
  .replace(/She\s?ll\s/g, "She'll ")
  .replace(/\sshe\s?s\s/g, " she's ")
  .replace(/\sshe\s?d\s/g, " she'd ")
  .replace(/\sshe\s?ll\s/g, " she'll ")
  .replace(/It\s?s\s/g, "It's ")
  .replace(/It\s?ll\s/g, "It'll ")
  .replace(/\sit\s?ll\s/g, " it'll ")
  .replace(/They\s?re\s/g, "They're ")
  .replace(/They\s?ve\s/g, "They've ")
  .replace(/They\s?ll\s/g, "They'll ")
  .replace(/They\s?d\s/g, "They'd ")
  .replace(/\sthey\s?re\s/g, " they're ")
  .replace(/\sthey\s?ve\s/g, " they've ")
  .replace(/\sthey\s?ll\s/g, " they'll ")
  .replace(/\sthey\s?d\s/g, " they'd ")
  .replace(/We\sre\s/g, "We're ")
  .replace(/We\s?ve\s/g, "We've ")
  .replace(/We\s?ll\s/g, "We'll ")
  .replace(/We\s?d\s/g, "We'd ")
  .replace(/\swe\sre\s/g, " we're ")
  .replace(/\swe\s?ve\s/g, " we've ")
  .replace(/\swe\s?ll\s/g, " we'll ")
  .replace(/\swe\s?d\s/g, " we'd ")
  .replace(/Isn\s?t\s/g, "Isn't ")
  .replace(/\sisn\s?t\s/g, " isn't ")
  .replace(/Are\s?nt\s/g, "Aren't ")
  .replace(/\sare\s?nt\s/g, " aren't ")
  .replace(/Was\s?n't\s/g, "Wasn't ")
  .replace(/\swas\s?n't\s/g, " wasn't ")
  .replace(/Were\s?n't\s/g, "Weren't ")
  .replace(/\swere\s?n't\s/g, " weren't ")
  .replace(/Haven\s?t\s/g, "Haven't ")
  .replace(/\shaven\s?t\s/g, " haven't ")
  .replace(/Had\s?n't\s/g, "Hadn't ")
  .replace(/\shad\s?n't\s/g, " hadn't ")
  .replace(/Won\s?t\s/g, "Won't ")
  .replace(/\swon\s?t\s/g, " won't ")
  .replace(/Wouldn\s?t\s/g, "Wouldn't ")
  .replace(/\swouldn\s?t\s/g, " wouldn't ")
  .replace(/Can\s?t\s/g, "Can't ")
  .replace(/\scan\s?t\s/g, " can't ")
  .replace(/Don\s?t\s/g, "Don't ")
  .replace(/\sdon\s?t\s/g, " don't ")
  .replace(/Does\s?n't\s/g, "Doesn't ")
  .replace(/\sdoes\s?n't\s/g, " doesn't ")
  .replace(/Did\s?n't\s/g, "Didn't ")
  .replace(/\sdid\s?n't\s/g, " didn't ")
  .replace(/Could\s?n't\s/g, "Couldn't ")
  .replace(/\scouldn\s?t\s/g, " couldn't ")
  .replace(/Should\s?n't\s/g, "Shouldn't ")
  .replace(/\sshould\s?n't\s/g, " shouldn't ")
  .trim();

  return { sourceText, translationText };
};

/**
 * Generates a unique ID
 */
export const generateId = (): string => {
  return Math.random().toString(36).substring(2, 11);
};