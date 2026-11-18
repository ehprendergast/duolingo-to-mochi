import React, { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { splitClozeSegments, stripGuardSpace } from '../utils/bookCloze';

/**
 * Approximate preview of how Mochi will render a Book Page passage:
 * Markdown paragraphs/headings/lists/tables, fenced code blocks, and
 * KaTeX math ($...$ inline, $$...$$ display).
 *
 * Hand-rolled on purpose (consistent with this codebase — no marked /
 * dompurify). All passage text is rendered as React text nodes, so HTML
 * in the source is escaped by React; the only innerHTML used is
 * KaTeX's own generated markup.
 *
 * Cloze groups render two ways:
 *  - 'answers': every group highlighted, with its group number.
 *  - 'card': only `activeGroup` is blanked (grey block; inside math, a
 *    \boxed{\phantom{...}}), mirroring Mochi's per-group card versions.
 *    Other groups show their text with a light marker.
 */

export type PreviewMode = 'answers' | 'card';

interface MarkdownPreviewProps {
  text: string;
  mode: PreviewMode;
  /** Group blanked in 'card' mode; other groups stay visible */
  activeGroup?: number;
}

interface PreviewCtx {
  mode: PreviewMode;
  activeGroup?: number;
}

/* ------------------------------ blocks ------------------------------ */

type Block =
  | { type: 'code'; content: string }
  | { type: 'heading'; level: number; content: string }
  | { type: 'displayMath'; tex: string }
  | { type: 'table'; rows: string[][] }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'hr' }
  | { type: 'paragraph'; lines: string[] };

function parseTableRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function classifyChunk(lines: string[]): Block {
  if (lines.length === 1) {
    const line = lines[0].trim();
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) return { type: 'heading', level: heading[1].length, content: heading[2] };
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) return { type: 'hr' };
  }

  const joined = lines.join('\n').trim();
  if (joined.startsWith('$$') && joined.endsWith('$$') && joined.length >= 4) {
    return { type: 'displayMath', tex: joined.slice(2, -2).trim() };
  }

  if (lines.every((l) => l.trim().startsWith('|'))) {
    const rows = lines
      .map(parseTableRow)
      .filter((cells) => !cells.every((c) => /^:?-+:?$/.test(c)));
    if (rows.length > 0) return { type: 'table', rows };
  }

  if (lines.every((l) => /^\s*([-*+]|\d+[.)])\s+/.test(l))) {
    const ordered = /^\s*\d+[.)]\s+/.test(lines[0]);
    return {
      type: 'list',
      ordered,
      items: lines.map((l) => l.replace(/^\s*([-*+]|\d+[.)])\s+/, '')),
    };
  }

  return { type: 'paragraph', lines };
}

function parseBlocks(text: string): Block[] {
  const lines = text.split('\n');
  const blocks: Block[] = [];
  let chunk: string[] = [];

  const flushChunk = () => {
    // Split the accumulated lines into blank-line-separated chunks
    let current: string[] = [];
    const pushCurrent = () => {
      if (current.length > 0) blocks.push(classifyChunk(current));
      current = [];
    };
    for (const line of chunk) {
      if (line.trim() === '') pushCurrent();
      else current.push(line);
    }
    pushCurrent();
    chunk = [];
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      flushChunk();
      const content: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        content.push(lines[i]);
        i++;
      }
      i++; // closing fence
      blocks.push({ type: 'code', content: content.join('\n') });
    } else {
      chunk.push(line);
      i++;
    }
  }
  flushChunk();
  return blocks;
}

/* ------------------------------ inline ------------------------------ */

/** Render a cloze occurrence in prose context. */
function renderCloze(
  group: number | null,
  inner: string,
  ctx: PreviewCtx,
  key: string
): React.ReactNode {
  if (ctx.mode === 'answers') {
    return (
      <span key={key} className="bg-yellow-200 rounded px-0.5" title={group ? `Cloze group ${group}` : 'Cloze'}>
        {group !== null && <sup className="text-[9px] font-bold text-yellow-800 mr-0.5">{group}</sup>}
        {renderInline(inner, ctx, `${key}-in`)}
      </span>
    );
  }
  // Card mode
  if (group === null || group === ctx.activeGroup) {
    return (
      <span
        key={key}
        className="bg-gray-300 rounded px-1 text-transparent select-none"
        aria-label="hidden answer"
      >
        {inner || '...'}
      </span>
    );
  }
  return (
    <span key={key} className="bg-sky-100 rounded px-0.5" title={`Cloze group ${group}`}>
      {renderInline(inner, ctx, `${key}-in`)}
    </span>
  );
}

/**
 * Render a math segment. Cloze markers can appear INSIDE the TeX (a
 * clozed formula fragment), so they are resolved at the TeX level:
 * answers are inlined (the whole equation gets a highlight ring), and
 * in card mode the active group becomes \boxed{\phantom{...}} — a
 * correctly-sized empty box, the way the card will actually quiz it.
 */
function renderMath(tex: string, display: boolean, ctx: PreviewCtx, key: string): React.ReactNode {
  const segments = splitClozeSegments(tex);
  const containsCloze = segments.some((s) => s.kind === 'cloze');

  const processed = segments
    .map((seg) => {
      if (seg.kind === 'text') return seg.value;
      if (ctx.mode === 'card' && (seg.group === null || seg.group === ctx.activeGroup)) {
        return `\\boxed{\\phantom{${seg.value}}}`;
      }
      return seg.value;
    })
    .join('');

  let html: string;
  try {
    html = katex.renderToString(processed, { displayMode: display, throwOnError: false });
  } catch {
    return (
      <code key={key} className="bg-red-50 text-red-700 rounded px-1">
        {tex}
      </code>
    );
  }

  const highlight = containsCloze && ctx.mode === 'answers';
  const className = highlight ? 'bg-yellow-100 ring-1 ring-yellow-300 rounded px-0.5' : undefined;

  if (display) {
    return (
      <div key={key} className={`my-2 overflow-x-auto text-center ${highlight ? 'bg-yellow-50 rounded-lg py-1' : ''}`}>
        <span className={className} dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    );
  }
  return <span key={key} className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

function findMathClose(text: string, from: number): number {
  const close = text.indexOf('$', from);
  if (close === -1) return -1;
  const content = text.slice(from, close);
  // Heuristics against currency "$5 ... $10" and stray dollars: inline
  // math doesn't span lines, isn't empty, and doesn't end in a space.
  if (content.length === 0 || content.includes('\n') || /\s$/.test(content)) return -1;
  return close;
}

function renderInline(text: string, ctx: PreviewCtx, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let buffer = '';
  let i = 0;
  let seq = 0;
  const key = () => `${keyBase}-${seq++}`;
  const flush = () => {
    if (buffer) {
      nodes.push(buffer);
      buffer = '';
    }
  };

  while (i < text.length) {
    // Cloze: {{N::...}} or {{...}}
    if (text.startsWith('{{', i)) {
      const close = text.indexOf('}}', i + 2);
      if (close !== -1) {
        const raw = text.slice(i + 2, close);
        const numbered = /^(\d+)::([\s\S]*)$/.exec(raw);
        flush();
        if (numbered) {
          nodes.push(renderCloze(parseInt(numbered[1], 10), stripGuardSpace(numbered[2]), ctx, key()));
        } else {
          nodes.push(renderCloze(null, raw, ctx, key()));
        }
        i = close + 2;
        continue;
      }
    }

    // Display math inline in a paragraph: $$...$$
    if (text.startsWith('$$', i)) {
      const close = text.indexOf('$$', i + 2);
      if (close !== -1) {
        flush();
        nodes.push(renderMath(text.slice(i + 2, close), true, ctx, key()));
        i = close + 2;
        continue;
      }
    }

    // Inline math: $...$
    if (text[i] === '$' && text[i + 1] !== undefined && !/\s/.test(text[i + 1])) {
      const close = findMathClose(text, i + 1);
      if (close !== -1) {
        flush();
        nodes.push(renderMath(text.slice(i + 1, close), false, ctx, key()));
        i = close + 1;
        continue;
      }
    }

    // Inline code: `...` (rendered raw — no cloze parsing inside)
    if (text[i] === '`') {
      const close = text.indexOf('`', i + 1);
      if (close !== -1) {
        flush();
        nodes.push(
          <code key={key()} className="bg-gray-100 rounded px-1 py-0.5 font-mono text-[0.85em]">
            {text.slice(i + 1, close)}
          </code>
        );
        i = close + 1;
        continue;
      }
    }

    // Bold: **...**
    if (text.startsWith('**', i)) {
      const close = text.indexOf('**', i + 2);
      if (close > i + 2) {
        flush();
        nodes.push(<strong key={key()}>{renderInline(text.slice(i + 2, close), ctx, key())}</strong>);
        i = close + 2;
        continue;
      }
    }

    // Italic: *...* (underscore emphasis intentionally unsupported —
    // book text is full of snake_case identifiers it would mangle)
    if (text[i] === '*') {
      const close = text.indexOf('*', i + 1);
      if (close > i + 1) {
        flush();
        nodes.push(<em key={key()}>{renderInline(text.slice(i + 1, close), ctx, key())}</em>);
        i = close + 1;
        continue;
      }
    }

    buffer += text[i];
    i++;
  }
  flush();
  return nodes;
}

/* --------------------------- code blocks ---------------------------- */

function renderCodeContent(content: string, ctx: PreviewCtx, keyBase: string): React.ReactNode[] {
  return splitClozeSegments(content).map((seg, idx) => {
    const k = `${keyBase}-${idx}`;
    if (seg.kind === 'text') return <React.Fragment key={k}>{seg.value}</React.Fragment>;
    if (ctx.mode === 'answers') {
      return (
        <span key={k} className="bg-yellow-200 rounded px-0.5" title={seg.group ? `Cloze group ${seg.group}` : 'Cloze'}>
          {seg.value}
        </span>
      );
    }
    if (seg.group === null || seg.group === ctx.activeGroup) {
      return (
        <span key={k} className="bg-gray-300 rounded px-0.5 text-transparent select-none">
          {seg.value || '...'}
        </span>
      );
    }
    return (
      <span key={k} className="bg-sky-100 rounded px-0.5">
        {seg.value}
      </span>
    );
  });
}

/* ----------------------------- component ---------------------------- */

const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({ text, mode, activeGroup }) => {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  const ctx: PreviewCtx = { mode, activeGroup };

  if (!text.trim()) {
    return <p className="text-sm text-gray-400">Nothing to preview yet.</p>;
  }

  return (
    <div className="text-[15px] leading-relaxed text-gray-800 [&_.katex-display]:my-0.5">
      {blocks.map((block, idx) => {
        const k = `b${idx}`;
        switch (block.type) {
          case 'heading': {
            const cls =
              block.level === 1
                ? 'text-xl font-bold mt-3 mb-1.5'
                : block.level === 2
                  ? 'text-lg font-bold mt-3 mb-1'
                  : 'text-base font-semibold mt-2 mb-1';
            return (
              <div key={k} className={cls}>
                {renderInline(block.content, ctx, k)}
              </div>
            );
          }
          case 'displayMath':
            return <React.Fragment key={k}>{renderMath(block.tex, true, ctx, k)}</React.Fragment>;
          case 'code':
            return (
              <pre key={k} className="bg-gray-50 border border-gray-200 rounded-lg p-3 overflow-x-auto my-2">
                <code className="font-mono text-[13px] leading-relaxed">{renderCodeContent(block.content, ctx, k)}</code>
              </pre>
            );
          case 'table':
            return (
              <div key={k} className="overflow-x-auto my-2">
                <table className="border-collapse text-sm">
                  <thead>
                    <tr>
                      {block.rows[0].map((cell, ci) => (
                        <th key={ci} className="border border-gray-300 bg-gray-50 px-2 py-1 text-left">
                          {renderInline(cell, ctx, `${k}-h${ci}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.slice(1).map((row, ri) => (
                      <tr key={ri}>
                        {row.map((cell, ci) => (
                          <td key={ci} className="border border-gray-300 px-2 py-1">
                            {renderInline(cell, ctx, `${k}-r${ri}c${ci}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case 'list': {
            const ListTag = block.ordered ? 'ol' : 'ul';
            return (
              <ListTag key={k} className={`${block.ordered ? 'list-decimal' : 'list-disc'} pl-5 my-1.5 space-y-0.5`}>
                {block.items.map((item, ii) => (
                  <li key={ii}>{renderInline(item, ctx, `${k}-i${ii}`)}</li>
                ))}
              </ListTag>
            );
          }
          case 'hr':
            return <hr key={k} className="my-3 border-gray-200" />;
          case 'paragraph':
          default:
            return (
              <p key={k} className="my-1.5">
                {block.lines.map((line, li) => (
                  <React.Fragment key={li}>
                    {li > 0 && <br />}
                    {renderInline(line, ctx, `${k}-l${li}`)}
                  </React.Fragment>
                ))}
              </p>
            );
        }
      })}
    </div>
  );
};

export default MarkdownPreview;
