'use client';

import React, { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Copy, Check } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
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
          className="flex items-center gap-1.5 px-2 py-0.5 rounded-md hover:bg-slate-700/60 text-slate-300 hover:text-white transition"
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

function MarkdownRendererComponent({ content, isStreaming }: MarkdownRendererProps) {
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
          // Custom external link: opens in new tab with noopener noreferrer
          a: ({ href, children, ...props }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition font-medium"
              {...props}
            >
              {children}
            </a>
          ),

          // Code blocks & inline code
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children, ...props }) => {
            const isCodeBlock = Boolean(className && className.includes('language-')) ||
              (typeof children === 'string' && children.includes('\n'));

            if (isCodeBlock) {
              return <CodeBlock className={className}>{children}</CodeBlock>;
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
    // If not streaming and content has not changed, skip re-render
    if (!prevProps.isStreaming && !nextProps.isStreaming && prevProps.content === nextProps.content) {
      return true;
    }
    // If neither changed
    if (prevProps.isStreaming === nextProps.isStreaming && prevProps.content === nextProps.content) {
      return true;
    }
    return false;
  }
);

