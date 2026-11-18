import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import ImageUpload from './ImageUpload';
import FormattedTextOutput from './FormattedTextOutput';
import MarkdownPreview, { PreviewMode } from './MarkdownPreview';
import { transcribeBookPage } from '../services/bookOCR';
import {
  wrapAllInstances,
  listClozeGroups,
  removeClozeGroup,
  hasAnyCloze,
} from '../utils/bookCloze';
import { generateId } from '../utils/formatting';
import { OutputBlock } from '../utils/outputReconcile';
import { BookPassage } from '../types';
import {
  AlertCircle,
  BookOpen,
  ClipboardPaste,
  Eye,
  Highlighter,
  Loader2,
  RotateCcw,
  Scissors,
  Trash2,
  X,
} from 'lucide-react';

/**
 * Book Page mode: photograph a single-language book / e-book page, get a
 * Markdown transcription (LaTeX math, fenced code), trim it down to the
 * focus passage, then select any span — prose, a LaTeX fragment, a code
 * token — and cloze EVERY instance of it as one numbered Mochi group.
 */
const BookClozeProcessor: React.FC = () => {
  const [passages, setPassages] = useState<BookPassage[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selection, setSelection] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>('answers');
  const [previewGroup, setPreviewGroup] = useState<number>(1);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteValue, setPasteValue] = useState('');

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const passagesRef = useRef<BookPassage[]>([]);
  passagesRef.current = passages;

  const active = passages.find((p) => p.id === activeId) ?? null;
  const activeGroups = useMemo(() => (active ? listClozeGroups(active.text) : []), [active]);

  // Revoke object URLs on unmount
  useEffect(() => {
    return () => {
      passagesRef.current.forEach((p) => {
        if (p.imageUrl) URL.revokeObjectURL(p.imageUrl);
      });
    };
  }, []);

  // Keep the card-preview group picker on a group that exists
  useEffect(() => {
    if (activeGroups.length > 0 && !activeGroups.some((g) => g.group === previewGroup)) {
      setPreviewGroup(activeGroups[0].group);
    }
  }, [activeGroups, previewGroup]);

  const showNotice = useCallback((msg: string) => {
    setNotice(msg);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 4500);
  }, []);

  const updatePassage = useCallback((id: string, patch: Partial<BookPassage>) => {
    setPassages((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  /* ------------------------------ import ------------------------------ */

  const handleImagesUploaded = useCallback(
    async (files: File[]) => {
      const newPassages: BookPassage[] = files.map((file, idx) => {
        const base = file.name.replace(/\.[^.]+$/, '');
        return {
          id: generateId(),
          name: base && base !== 'image' ? base : `Page ${passagesRef.current.length + idx + 1}`,
          text: '',
          originalText: '',
          imageUrl: URL.createObjectURL(file),
          status: 'transcribing' as const,
        };
      });

      setPassages((prev) => [...prev, ...newPassages]);
      setActiveId((prev) => prev ?? newPassages[0].id);

      await Promise.all(
        newPassages.map(async (passage) => {
          try {
            const result = await transcribeBookPage(passage.imageUrl!);
            updatePassage(passage.id, {
              text: result.markdown,
              originalText: result.markdown,
              status: 'ready',
              usedFallbackTranscription: result.fallback,
              transcriptionProvider: result.provider,
            });
          } catch (err) {
            console.error('Book transcription failed for', passage.id, err);
            updatePassage(passage.id, {
              status: 'error',
              error: 'Transcription failed — you can paste or type the passage text below instead.',
            });
          }
        })
      );
    },
    [updatePassage]
  );

  const handleAddPastedText = useCallback(() => {
    const text = pasteValue.trim();
    if (!text) return;
    const passage: BookPassage = {
      id: generateId(),
      name: `Pasted text ${passagesRef.current.filter((p) => !p.imageUrl).length + 1}`,
      text,
      originalText: text,
      status: 'ready',
      transcriptionProvider: 'pasted',
    };
    setPassages((prev) => [...prev, passage]);
    setActiveId(passage.id);
    setPasteValue('');
    setShowPaste(false);
  }, [pasteValue]);

  const handleDeletePassage = useCallback(
    (id: string) => {
      setPassages((prev) => {
        const target = prev.find((p) => p.id === id);
        if (target?.imageUrl) URL.revokeObjectURL(target.imageUrl);
        return prev.filter((p) => p.id !== id);
      });
      setActiveId((prev) => (prev === id ? null : prev));
    },
    []
  );

  /* ------------------------------ editing ------------------------------ */

  const refreshSelection = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    setSelection(ta.value.substring(ta.selectionStart, ta.selectionEnd));
  }, []);

  const setActiveText = useCallback(
    (text: string) => {
      if (!active) return;
      updatePassage(active.id, { text });
      setSelection('');
    },
    [active, updatePassage]
  );

  const handleCloze = useCallback(() => {
    if (!active || !selection.trim()) return;
    const result = wrapAllInstances(active.text, selection);
    if (result.count === 0) {
      showNotice(
        `No unwrapped instances of "${truncate(result.term, 40)}" found — it may already be clozed.`
      );
      return;
    }
    setActiveText(result.text);
    showNotice(
      `Clozed ${result.count} instance${result.count === 1 ? '' : 's'} as group ${result.group}: "${truncate(result.term, 40)}"`
    );
    textareaRef.current?.focus();
  }, [active, selection, setActiveText, showNotice]);

  const handleKeepSelectionOnly = useCallback(() => {
    if (!active || !selection.trim()) return;
    setActiveText(selection.trim());
    showNotice('Kept only the selected text. "Reset" restores the full transcription.');
  }, [active, selection, setActiveText, showNotice]);

  const handleReset = useCallback(() => {
    if (!active || active.text === active.originalText) return;
    if (
      window.confirm(
        'Reset this passage to the full transcription? Your edits and clozes for this passage will be lost.'
      )
    ) {
      setActiveText(active.originalText);
      showNotice('Restored the full transcription.');
    }
  }, [active, setActiveText, showNotice]);

  const handleRemoveGroup = useCallback(
    (group: number) => {
      if (!active) return;
      setActiveText(removeClozeGroup(active.text, group));
      showNotice(`Removed cloze group ${group}.`);
    },
    [active, setActiveText, showNotice]
  );

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      handleCloze();
    }
  };

  /* ------------------------------ output ------------------------------ */

  const outputBlocks: OutputBlock[] = useMemo(
    () =>
      passages
        .filter((p) => p.text.trim().length > 0)
        .map((p) => ({ id: p.id, block: `# ${p.text.trim()}` })),
    [passages]
  );

  const statsLabel = useMemo(() => {
    let clozes = 0;
    let groups = 0;
    for (const p of passages) {
      const gs = listClozeGroups(p.text);
      groups += gs.length;
      clozes += gs.reduce((sum, g) => sum + g.count, 0);
    }
    return `${clozes} clozes · ${groups} groups`;
  }, [passages]);

  const hasSelection = selection.trim().length > 0;

  return (
    <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-8 max-w-7xl">
      <div className="mb-4 bg-white rounded-xl shadow-sm p-4 border">
        <div className="flex items-center gap-3">
          <BookOpen className="h-6 w-6 text-indigo-500" />
          <div>
            <h2 className="text-base sm:text-lg font-bold text-gray-800">Book Page Cloze</h2>
            <p className="text-xs text-gray-500">
              Photograph a book or e-book page → trim to the passage → select a term, formula fragment, or code token → cloze every instance
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row lg:space-x-6 gap-6">
        {/* Left column — import + passage list */}
        <div className="w-full lg:w-[45%]">
          <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border lg:sticky lg:top-4">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Add Pages</h2>

            <ImageUpload onImagesUploaded={handleImagesUploaded} isProcessing={false} />

            <button
              onClick={() => setShowPaste((v) => !v)}
              className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 min-h-[44px] active:scale-[0.99]"
              type="button"
            >
              <ClipboardPaste size={16} />
              Paste text instead (e-book)
            </button>

            {showPaste && (
              <div className="mt-3 space-y-2">
                <textarea
                  value={pasteValue}
                  onChange={(e) => setPasteValue(e.target.value)}
                  className="w-full h-32 p-3 border rounded-lg font-mono resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  style={{ fontSize: '16px' }}
                  placeholder="Paste passage text here — Markdown, $LaTeX$ math, and ``` code fences all work…"
                  spellCheck={false}
                />
                <button
                  onClick={handleAddPastedText}
                  disabled={!pasteValue.trim()}
                  className="w-full px-3 py-2.5 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px]"
                  type="button"
                >
                  Add as passage
                </button>
              </div>
            )}

            {passages.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-medium mb-3 text-gray-700">
                  Passages ({passages.length})
                </h3>
                <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                  {passages.map((passage) => {
                    const groups = listClozeGroups(passage.text);
                    const clozeCount = groups.reduce((s, g) => s + g.count, 0);
                    const isActive = passage.id === activeId;
                    return (
                      <div
                        key={passage.id}
                        onClick={() => setActiveId(passage.id)}
                        className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                          isActive
                            ? 'border-indigo-300 bg-indigo-50/60'
                            : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        {passage.imageUrl ? (
                          <img
                            src={passage.imageUrl}
                            alt={passage.name}
                            className="w-10 h-12 object-cover rounded border flex-shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-12 rounded border bg-gray-50 flex items-center justify-center flex-shrink-0">
                            <BookOpen size={16} className="text-gray-400" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-800 truncate">{passage.name}</p>
                          {passage.status === 'transcribing' ? (
                            <p className="text-xs text-blue-600 flex items-center gap-1">
                              <Loader2 size={12} className="animate-spin" /> Transcribing…
                            </p>
                          ) : passage.status === 'error' ? (
                            <p className="text-xs text-red-600">Transcription failed</p>
                          ) : clozeCount > 0 ? (
                            <p className="text-xs text-gray-500">
                              {clozeCount} cloze{clozeCount === 1 ? '' : 's'} · {groups.length} group
                              {groups.length === 1 ? '' : 's'}
                            </p>
                          ) : (
                            <p className="text-xs text-amber-600 font-medium">No cloze yet</p>
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeletePassage(passage.id);
                          }}
                          className="p-2 text-gray-400 hover:text-red-500 rounded-lg flex-shrink-0"
                          title="Remove passage"
                          type="button"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right column — editor, preview, output */}
        <div className="w-full lg:w-[55%]">
          <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border">
            {!active ? (
              <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center">
                <div className="flex flex-col items-center justify-center space-y-3">
                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                    <BookOpen className="h-6 w-6 text-gray-400" />
                  </div>
                  <p className="text-gray-500 text-sm">Add a page photo or paste text to start</p>
                  <p className="text-xs text-gray-400 max-w-[300px]">
                    The page is transcribed to Markdown — math becomes $LaTeX$, code goes in fences — then you trim it and cloze the terms you want to learn.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-bold text-gray-800 truncate">{active.name}</h2>
                  {active.transcriptionProvider && active.status === 'ready' && (
                    <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full border flex-shrink-0">
                      via {active.transcriptionProvider}
                    </span>
                  )}
                </div>

                {active.status === 'transcribing' && (
                  <div className="bg-blue-50 text-blue-700 p-3 rounded-lg flex items-center gap-2 text-sm border border-blue-100">
                    <Loader2 className="animate-spin flex-shrink-0" size={18} />
                    Transcribing page… a vision model is reading it (math → LaTeX, code → fences).
                  </div>
                )}

                {active.status === 'error' && (
                  <div className="bg-red-50 text-red-700 p-3 rounded-lg flex items-start gap-2 text-sm border border-red-100">
                    <AlertCircle className="mt-0.5 flex-shrink-0" size={18} />
                    <span>{active.error}</span>
                  </div>
                )}

                {active.usedFallbackTranscription && active.status === 'ready' && (
                  <div className="bg-amber-50 text-amber-800 p-3 rounded-lg flex items-start gap-2 text-xs border border-amber-200">
                    <AlertCircle className="mt-0.5 flex-shrink-0" size={16} />
                    <span>
                      Transcribed with on-device OCR (Tesseract) because no cloud transcription
                      provider is configured — math and code will be garbled plain text and need
                      hand-fixing. Set ANTHROPIC_API_KEY or OPENAI_API_KEY for the Netlify
                      book-ocr function to get LaTeX and code fences.
                    </span>
                  </div>
                )}

                {active.imageUrl && (
                  <details className="text-sm">
                    <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                      Compare with the page photo
                    </summary>
                    <img
                      src={active.imageUrl}
                      alt={`Source page for ${active.name}`}
                      className="mt-2 w-full max-h-72 object-contain rounded-lg border bg-gray-50"
                    />
                  </details>
                )}

                {/* Editor */}
                <textarea
                  ref={textareaRef}
                  value={active.text}
                  onChange={(e) => updatePassage(active.id, { text: e.target.value })}
                  onSelect={refreshSelection}
                  onKeyUp={refreshSelection}
                  onKeyDown={handleEditorKeyDown}
                  rows={14}
                  className="w-full p-3 border rounded-lg font-mono resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent leading-relaxed"
                  style={{ fontSize: '16px', tabSize: 2 }}
                  placeholder="Transcribed passage appears here. Edit freely, select a span, then cloze it."
                  spellCheck={false}
                />

                {/* Editor actions */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleCloze}
                    disabled={!hasSelection}
                    className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px] active:scale-[0.98]"
                    type="button"
                    title="Wrap every instance of the selection as one cloze group (Cmd/Ctrl+L)"
                  >
                    <Highlighter size={16} />
                    Cloze all instances
                    <span className="hidden sm:inline text-[10px] bg-white/20 rounded px-1 py-0.5 font-mono">⌘L</span>
                  </button>
                  <button
                    onClick={handleKeepSelectionOnly}
                    disabled={!hasSelection}
                    className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px]"
                    type="button"
                    title="Replace the passage with just the selected text"
                  >
                    <Scissors size={16} />
                    Keep selection only
                  </button>
                  <button
                    onClick={handleReset}
                    disabled={active.text === active.originalText}
                    className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px]"
                    type="button"
                    title="Restore the untouched full transcription"
                  >
                    <RotateCcw size={16} />
                    Reset
                  </button>
                </div>

                <p className="text-[11px] text-gray-400">
                  {hasSelection
                    ? `Selected: "${truncate(selection.replace(/\s+/g, ' '), 60)}" (${selection.trim().length} chars)`
                    : 'Select any span — a word, a phrase, part of a $formula$, a code token — then Cloze all instances.'}
                </p>

                {notice && (
                  <div className="bg-green-50 text-green-700 p-2.5 rounded-lg text-xs border border-green-100 animate-in fade-in">
                    {notice}
                  </div>
                )}

                {/* Cloze group chips */}
                {activeGroups.length > 0 && (
                  <div>
                    <h3 className="text-xs font-medium text-gray-500 mb-1.5">Cloze groups on this card</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {activeGroups.map((g) => (
                        <span
                          key={g.group}
                          className="inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-800 border border-indigo-200 rounded-full pl-2.5 pr-1 py-1 text-xs"
                        >
                          <span className="font-mono" title={g.term}>
                            {g.group} · {truncate(g.term.replace(/\s+/g, ' '), 30)} · ×{g.count}
                          </span>
                          <button
                            onClick={() => handleRemoveGroup(g.group)}
                            className="p-1 rounded-full hover:bg-indigo-100 text-indigo-500"
                            title={`Remove group ${g.group} (unwrap all instances)`}
                            type="button"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Preview */}
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <h3 className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                      <Eye size={16} className="text-gray-400" />
                      Preview
                    </h3>
                    <div className="flex items-center gap-1.5">
                      <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                        <button
                          onClick={() => setPreviewMode('answers')}
                          className={`px-2.5 py-1.5 text-xs font-medium min-h-[36px] ${
                            previewMode === 'answers' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                          }`}
                          type="button"
                        >
                          Show answers
                        </button>
                        <button
                          onClick={() => setPreviewMode('card')}
                          className={`px-2.5 py-1.5 text-xs font-medium min-h-[36px] ${
                            previewMode === 'card' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                          }`}
                          type="button"
                        >
                          Card preview
                        </button>
                      </div>
                      {previewMode === 'card' && activeGroups.length > 0 && (
                        <select
                          value={previewGroup}
                          onChange={(e) => setPreviewGroup(parseInt(e.target.value, 10))}
                          className="border border-gray-300 rounded-lg py-1.5 px-2 text-xs bg-white min-h-[36px]"
                          title="Which cloze group is blanked on this card version"
                        >
                          {activeGroups.map((g) => (
                            <option key={g.group} value={g.group}>
                              Group {g.group} blanked
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                  <div className="border rounded-xl p-4 bg-gray-50/50 max-h-[60vh] overflow-y-auto">
                    <MarkdownPreview text={active.text} mode={previewMode} activeGroup={previewGroup} />
                  </div>
                  {!hasAnyCloze(active.text) && active.text.trim() && (
                    <p className="text-[11px] text-amber-600 mt-1.5">
                      This passage has no cloze yet — it will still be included in the output below as a plain card.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Output */}
            {outputBlocks.length > 0 && (
              <FormattedTextOutput textPairs={[]} rawBlocks={outputBlocks} statsLabel={statsLabel} />
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-100 rounded-xl p-4">
        <h3 className="font-medium text-indigo-900 text-sm mb-2">How Book Page mode works</h3>
        <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
          <li><strong>Transcription:</strong> A vision model rewrites the page as Markdown — math as $LaTeX$ (KaTeX in Mochi), code and pseudocode in fenced blocks. Without a cloud key it falls back to on-device OCR, and math/code need hand-fixing.</li>
          <li><strong>Trim:</strong> Select the focus paragraph and hit <em>Keep selection only</em>; <em>Reset</em> always restores the full transcription.</li>
          <li><strong>Cloze:</strong> Select any span and press <span className="font-mono bg-white px-1 rounded">⌘L</span> / <span className="font-mono bg-white px-1 rounded">Ctrl+L</span> — every instance is wrapped as one numbered group <code className="bg-white px-1 rounded">{'{{1::term}}'}</code>, so each term becomes one Mochi card version.</li>
          <li><strong>Inside formulas &amp; code:</strong> You can cloze a fragment of a $formula$ or a token inside a code fence, not just whole words.</li>
        </ul>
      </div>
    </div>
  );
};

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export default BookClozeProcessor;
