'use client';

import React, { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import { Copy, Check, BookOpen } from 'lucide-react';
import { ChatSource } from '@/types';

interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
  sources?: ChatSource[];
  onOpenCitation?: (source: ChatSource, triggerEl?: HTMLButtonElement | null) => void;
}

export function findMatchingSource(
  rawText: string,
  sources?: ChatSource[]
): ChatSource | undefined {
  if (!sources || sources.length === 0 || !rawText) return undefined;

  const clean = rawText.trim().toLowerCase();
  if (!clean) return undefined;

  for (const s of sources) {
    if (s.documentId && s.documentId.toLowerCase() === clean) return s;
    if (s.documentTitle && s.documentTitle.toLowerCase() === clean) return s;
    if (s.originalName && s.originalName.toLowerCase() === clean) return s;
  }

  const cleanBase = clean.replace(/\.[a-z0-9]+$/i, '');
  for (const s of sources) {
    const titleBase = (s.documentTitle || '').toLowerCase().replace(/\.[a-z0-9]+$/i, '');
    const origBase = (s.originalName || '').toLowerCase().replace(/\.[a-z0-9]+$/i, '');
    if (cleanBase === titleBase || cleanBase === origBase) return s;
  }

  for (const s of sources) {
    const title = (s.documentTitle || '').toLowerCase();
    const orig = (s.originalName || '').toLowerCase();
    if (title && (clean.includes(title) || title.includes(clean))) return s;
    if (orig && (clean.includes(orig) || orig.includes(clean))) return s;
  }

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

  if (/\.(pdf|docx|txt|csv|xlsx|md|pptx)$/i.test(clean) && sources.length === 1) {
    return sources[0];
  }

  return undefined;
}

function extractTextFromChildren(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(extractTextFromChildren).join('');
  if (React.isValidElement(children) && children.props && 'children' in children.props) {
    return extractTextFromChildren(children.props.children);
  }
  return '';
}

function CodeBlock({ children, className }: { children: React.ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';
  const rawCode = extractTextFromChildren(children).replace(/\n$/, '');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(rawCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access unavailable or rejected
    }
  };

  return (
    <div className="relative my-3 rounded-card overflow-hidden border border-border bg-surface-code shadow-sm group">
      <div className="flex items-center justify-between px-3.5 py-1 bg-surface-1 border-b border-border text-xs text-text-muted select-none">
        <span className="font-mono text-xs font-medium text-text-secondary lowercase">
          {language || 'code'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? 'Code copied to clipboard' : 'Copy code to clipboard'}
          className="flex items-center gap-1.5 px-2 py-1 min-h-[36px] rounded-control hover:bg-surface-2 active:bg-surface-2 text-text-muted hover:text-text-primary transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-accent" />
              <span className="text-[11px] text-accent font-medium">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 text-text-muted" />
              <span className="text-[11px]">Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3.5 overflow-x-auto text-[13px] font-mono leading-relaxed bg-surface-code text-text-primary">
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

function MarkdownRendererComponent({
  content,
  isStreaming,
  sources,
  onOpenCitation
}: MarkdownRendererProps) {
  // Pre-process stream text: safely auto-close open code fences and keep incomplete math plain text until closed
  const sanitizedContent = useMemo(() => {
    let text = content;
    if (!isStreaming || !text) return text;

    // 1. Incomplete code fence handling: safely auto-close open code fences
    const fenceMatches = text.match(/```/g);
    if (fenceMatches && fenceMatches.length % 2 !== 0) {
      return text + '\n```';
    }

    // 2. Incomplete math handling during streaming:
    // Split by complete code blocks so math inside code blocks is never touched
    const parts = text.split(/(```[\s\S]*?```)/g);
    let lastPart = parts[parts.length - 1];

    // Incomplete display math $$: escape unclosed opening $$ so it stays plain text until closed
    const displayMatches = lastPart.match(/(?<!\\)\$\$/g) || [];
    if (displayMatches.length % 2 !== 0) {
      const lastIdx = lastPart.lastIndexOf('$$');
      if (lastIdx !== -1) {
        lastPart = lastPart.slice(0, lastIdx) + '\\$\\$' + lastPart.slice(lastIdx + 2);
      }
    }

    // Incomplete inline math $: escape unclosed opening $ so it stays plain text until closed
    const singleMatches = lastPart.match(/(?<!\\)\$(?!\$)/g) || [];
    if (singleMatches.length % 2 !== 0) {
      const lastIdx = lastPart.lastIndexOf('$');
      if (lastIdx !== -1) {
        lastPart = lastPart.slice(0, lastIdx) + '\\$' + lastPart.slice(lastIdx + 1);
      }
    }

    parts[parts.length - 1] = lastPart;
    return parts.join('');
  }, [content, isStreaming]);

  return (
    <div className="space-y-2 text-chat leading-[1.65] text-text-primary">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          rehypeHighlight,
          [rehypeKatex, { throwOnError: false, strict: false, errorColor: 'inherit' }]
        ]}
        components={{
          a: ({ href, children, ...props }) => {
            const rawText = extractTextFromChildren(children).trim();
            const matchedSource =
              findMatchingSource(rawText, sources) ||
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
                  className="inline-flex items-center gap-1 text-accent hover:underline underline-offset-2 transition-colors duration-150 font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm"
                  title={`View citation details for ${matchedSource.documentTitle || matchedSource.originalName}`}
                  aria-label={`Open citation details for ${matchedSource.documentTitle || matchedSource.originalName}`}
                >
                  <BookOpen className="w-3.5 h-3.5 text-accent flex-shrink-0" aria-hidden="true" />
                  <span>{children}</span>
                </button>
              );
            }

            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline underline-offset-2 transition-colors duration-150 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm"
                {...props}
              >
                {children}
              </a>
            );
          },

          pre: ({ children }) => <>{children}</>,
          code: ({ className, children, ...props }) => {
            const isCodeBlock =
              Boolean(className && className.includes('language-')) ||
              (typeof children === 'string' && children.includes('\n'));

            if (isCodeBlock) {
              return <CodeBlock className={className}>{children}</CodeBlock>;
            }

            const rawText = extractTextFromChildren(children).trim();
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
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 my-0.5 rounded bg-accent-soft hover:bg-accent-soft/80 active:bg-accent-soft/90 border border-accent-border text-accent font-mono text-[12px] transition-colors duration-150 cursor-pointer shadow-sm mx-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent align-baseline"
                  title={`Click to view document details for ${matchedSource.documentTitle || matchedSource.originalName}`}
                  aria-label={`Open citation details for ${matchedSource.documentTitle || matchedSource.originalName}`}
                >
                  <BookOpen className="w-3 h-3 text-accent flex-shrink-0" aria-hidden="true" />
                  <span className="font-semibold underline underline-offset-2 decoration-accent/50">
                    {children}
                  </span>
                </button>
              );
            }

            return (
              <code
                className="px-1.5 py-0.5 rounded bg-surface-3 border border-border text-text-primary font-mono text-[13px]"
                {...props}
              >
                {children}
              </code>
            );
          },

          h1: ({ children }) => (
            <h1 className="text-lg font-semibold text-text-primary tracking-tight mt-4 mb-2 pb-1 border-b border-border">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base font-semibold text-text-primary tracking-tight mt-3 mb-1.5">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold text-text-primary tracking-tight mt-2.5 mb-1">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="leading-[1.65] my-1.5 text-text-primary">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-outside pl-5 space-y-1 my-2 text-text-secondary">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-outside pl-5 space-y-1 my-2 text-text-secondary">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="leading-[1.65]">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-border-strong pl-3.5 my-2.5 text-text-secondary italic">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-3 rounded-card border border-border bg-surface-1 shadow-sm">
              <table className="min-w-full text-left text-xs divide-y divide-border">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-surface-2 border-b border-border">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-border bg-transparent">{children}</tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-surface-2 transition-colors duration-100">{children}</tr>
          ),
          th: ({ children }) => (
            <th className="px-3.5 py-2.5 text-xs font-medium text-text-muted">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3.5 py-2.5 text-text-secondary text-xs">{children}</td>
          ),
          hr: () => <hr className="my-3 border-border" />
        }}
      >
        {sanitizedContent}
      </ReactMarkdown>

      {isStreaming && (
        <span
          aria-hidden="true"
          className="inline-block w-0.5 h-4 ml-1 bg-accent align-middle animate-pulse motion-reduce:animate-none rounded-sm"
        />
      )}
    </div>
  );
}

export const MarkdownRenderer = React.memo(
  MarkdownRendererComponent,
  (prevProps, nextProps) => {
    if (
      !prevProps.isStreaming &&
      !nextProps.isStreaming &&
      prevProps.content === nextProps.content &&
      prevProps.sources === nextProps.sources
    ) {
      return true;
    }
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
