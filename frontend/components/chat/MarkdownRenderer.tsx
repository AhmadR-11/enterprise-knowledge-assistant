'use client';

import React, { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Copy, Check, BookOpen } from 'lucide-react';
import { ChatSource } from '@/types';

interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
  sources?: ChatSource[];
  onOpenCitation?: (source: ChatSource, triggerEl?: HTMLButtonElement | null) => void;
}

/**
 * Matches an inline code string or markdown link label against available message sources.
 */
export function findMatchingSource(
  rawText: string,
  sources?: ChatSource[]
): ChatSource | undefined {
  if (!sources || sources.length === 0 || !rawText) return undefined;

  const clean = rawText.trim().toLowerCase();
  if (!clean) return undefined;

  // 1. Direct match on documentId, documentTitle, or originalName
  for (const s of sources) {
    if (s.documentId && s.documentId.toLowerCase() === clean) return s;
    if (s.documentTitle && s.documentTitle.toLowerCase() === clean) return s;
    if (s.originalName && s.originalName.toLowerCase() === clean) return s;
  }

  // 2. Strip standard file extensions (.pdf, .docx, .txt, etc.) and compare base names
  const cleanBase = clean.replace(/\.[a-z0-9]+$/i, '');
  for (const s of sources) {
    const titleBase = (s.documentTitle || '').toLowerCase().replace(/\.[a-z0-9]+$/i, '');
    const origBase = (s.originalName || '').toLowerCase().replace(/\.[a-z0-9]+$/i, '');
    if (cleanBase === titleBase || cleanBase === origBase) return s;
  }

  // 3. Substring match: if text includes document title/filename or vice versa
  for (const s of sources) {
    const title = (s.documentTitle || '').toLowerCase();
    const orig = (s.originalName || '').toLowerCase();
    if (title && (clean.includes(title) || title.includes(clean))) return s;
    if (orig && (clean.includes(orig) || orig.includes(clean))) return s;
  }

  // 4. Token overlap for hyphenated/underscored filenames (e.g. "Ahmad-Raza-Software-Engineer.pdf")
  const tokens = clean.split(/[-_.\s]+/).filter((t) => t.length > 2);
  if (tokens.length > 0) {
    for (const s of sources) {
      const combined = `${s.documentTitle || ''} ${s.originalName || ''}`.toLowerCase();
      const matchCount = tokens.filter((t) => combined.includes(t)).length;
      if (matchCount >= Math.min(2, tokens.length)) {
        return s;
      }
    }
  }

  // 5. Fallback: if the text explicitly ends in a known document extension and only 1 source exists
  if (/\.(pdf|docx|txt|csv|xlsx|md|pptx)$/i.test(clean) && sources.length === 1) {
    return sources[0];
  }

  return undefined;
}

/**
 * Extracts plain text string from React children for clipboard copying.
 */
function extractTextFromChildren(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(extractTextFromChildren).join('');
  if (React.isValidElement(children) && children.props && 'children' in children.props) {
    return extractTextFromChildren(children.props.children);
  }
  return '';
}

/**
 * CodeBlock component with language badge and copy-to-clipboard functionality.
 */
function CodeBlock({ children, className }: { children: React.ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';
  const rawCode = extractTextFromChildren(children).replace(/\n$/, '');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(rawCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access unavailable or rejected
    }
  };

  return (
    <div className="relative my-3 rounded-xl overflow-hidden border border-slate-700/80 bg-[#0c1222] shadow-md group">
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-[#131b30] border-b border-slate-800 text-[11px] text-slate-400 select-none">
        <span className="font-mono uppercase font-semibold text-indigo-400">
          {language || 'code'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? 'Code copied to clipboard' : 'Copy code to clipboard'}
          style={{ cursor: 'pointer' }}
          className="flex items-center gap-1.5 px-2 py-0.5 rounded-md hover:bg-slate-700/60 text-slate-300 hover:text-white transition cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[10px] text-emerald-400 font-medium">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[10px]">Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3.5 overflow-x-auto text-xs font-mono leading-relaxed bg-[#0c1222] text-slate-200">
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

function MarkdownRendererComponent({ content, isStreaming, sources, onOpenCitation }: MarkdownRendererProps) {
  // Pre-process stream text: auto-close open code fences mid-stream to avoid layout shifts & flicker
  const sanitizedContent = useMemo(() => {
    let text = content;
    if (isStreaming) {
      const fenceMatches = text.match(/```/g);
      if (fenceMatches && fenceMatches.length % 2 !== 0) {
        text += '\n```';
      }
    }
    return text;
  }, [content, isStreaming]);

  return (
    <div className="markdown-body space-y-2 text-xs leading-relaxed text-slate-200">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          // Custom link: if matches a source, opens citation slide-over; otherwise external link
          a: ({ href, children, ...props }) => {
            const rawText = extractTextFromChildren(children).trim();
            const matchedSource = findMatchingSource(rawText, sources) ||
              (href ? findMatchingSource(href, sources) : undefined);

            if (matchedSource && onOpenCitation) {
              return (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onOpenCitation(matchedSource, e.currentTarget);
                  }}
                  style={{ cursor: 'pointer' }}
                  className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition font-medium cursor-pointer"
                  title={`View citation details for ${matchedSource.documentTitle || matchedSource.originalName}`}
                  aria-label={`Open citation details for ${matchedSource.documentTitle || matchedSource.originalName}`}
                >
                  <BookOpen className="w-3 h-3 text-indigo-400 flex-shrink-0 cursor-pointer" aria-hidden="true" />
                  <span className="cursor-pointer">{children}</span>
                </button>
              );
            }

            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                style={{ cursor: 'pointer' }}
                className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition font-medium cursor-pointer"
                {...props}
              >
                {children}
              </a>
            );
          },

          // Code blocks & inline code
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children, ...props }) => {
            const isCodeBlock = Boolean(className && className.includes('language-')) ||
              (typeof children === 'string' && children.includes('\n'));

            if (isCodeBlock) {
              return <CodeBlock className={className}>{children}</CodeBlock>;
            }

            // Extract plain text string of the inline code
            const rawText = extractTextFromChildren(children).trim();

            // Check if this inline code refers to a cited document
            const matchedSource = findMatchingSource(rawText, sources);

            if (matchedSource && onOpenCitation) {
              return (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onOpenCitation(matchedSource, e.currentTarget);
                  }}
                  style={{ cursor: 'pointer' }}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 my-0.5 rounded-md bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/40 hover:border-indigo-400 text-indigo-300 hover:text-indigo-200 font-mono text-[11px] transition-all cursor-pointer shadow-sm mx-1 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 focus:ring-offset-[#151d35] align-baseline group/cite"
                  title={`Click to view document details for ${matchedSource.documentTitle || matchedSource.originalName}`}
                  aria-label={`Open citation details for ${matchedSource.documentTitle || matchedSource.originalName}`}
                >
                  <BookOpen className="w-3 h-3 text-indigo-400 group-hover/cite:text-indigo-300 flex-shrink-0 cursor-pointer" aria-hidden="true" />
                  <span className="font-semibold underline underline-offset-2 decoration-indigo-400/50 group-hover/cite:decoration-indigo-300 cursor-pointer">
                    {children}
                  </span>
                </button>
              );
            }

            return (
              <code
                className="px-1.5 py-0.5 rounded-md bg-[#131b30] border border-slate-700/70 text-indigo-300 font-mono text-[11px]"
                {...props}
              >
                {children}
              </code>
            );
          },

          // Typography styling
          h1: ({ children }) => <h1 className="text-base font-bold text-white mt-3 mb-1.5 pb-1 border-b border-slate-800">{children}</h1>,
          h2: ({ children }) => <h2 className="text-sm font-bold text-white mt-2.5 mb-1">{children}</h2>,
          h3: ({ children }) => <h3 className="text-xs font-bold text-slate-100 mt-2 mb-1">{children}</h3>,
          p: ({ children }) => <p className="leading-relaxed my-1.5 text-slate-200">{children}</p>,
          ul: ({ children }) => <ul className="list-disc list-outside pl-4 space-y-1 my-2 text-slate-200">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-outside pl-4 space-y-1 my-2 text-slate-200">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-indigo-500 pl-3 my-2 text-slate-400 italic bg-indigo-500/5 py-1 rounded-r-lg">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-3 rounded-lg border border-slate-800">
              <table className="min-w-full text-left text-xs divide-y divide-slate-800">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-[#131b30] text-slate-300 font-semibold">{children}</thead>,
          tbody: ({ children }) => <tbody className="divide-y divide-slate-800/60 bg-[#0f1629]">{children}</tbody>,
          tr: ({ children }) => <tr className="hover:bg-slate-800/30 transition-colors">{children}</tr>,
          th: ({ children }) => <th className="px-3 py-2 text-slate-300 font-semibold">{children}</th>,
          td: ({ children }) => <td className="px-3 py-2 text-slate-300">{children}</td>,
          hr: () => <hr className="my-3 border-slate-800" />
        }}
      >
        {sanitizedContent}
      </ReactMarkdown>

      {/* Blinking caret indicator at the end of active stream */}
      {isStreaming && (
        <span
          aria-hidden="true"
          className="inline-block w-1.5 h-3.5 ml-1 bg-indigo-400 align-middle animate-pulse motion-reduce:animate-none rounded-sm shadow-sm shadow-indigo-500/50"
        />
      )}
    </div>
  );
}

/**
 * Memoized MarkdownRenderer:
 * Completed messages stay static and do NOT re-render during ongoing streams.
 */
export const MarkdownRenderer = React.memo(
  MarkdownRendererComponent,
  (prevProps, nextProps) => {
    // If not streaming and content + sources have not changed, skip re-render
    if (
      !prevProps.isStreaming &&
      !nextProps.isStreaming &&
      prevProps.content === nextProps.content &&
      prevProps.sources === nextProps.sources
    ) {
      return true;
    }
    // If neither changed
    if (
      prevProps.isStreaming === nextProps.isStreaming &&
      prevProps.content === nextProps.content &&
      prevProps.sources === nextProps.sources
    ) {
      return true;
    }
    return false;
  }
);

