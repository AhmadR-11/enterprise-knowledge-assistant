'use client';

import React from 'react';
import { Bot, User, BookOpen, AlertCircle, RotateCcw, Square, Search, FileText, Wrench } from 'lucide-react';
import { ChatMessage } from '@/hooks/useChatStream';
import { TypingIndicator } from './TypingIndicator';
import { MarkdownRenderer } from './MarkdownRenderer';

interface MessageBubbleProps {
  message: ChatMessage;
  onRetry?: () => void;
}

export function MessageBubble({ message, onRetry }: MessageBubbleProps) {
  const isUser = message.sender === 'user';
  const isWaiting = message.status === 'waiting' && !message.text;
  const isStreaming = message.status === 'streaming';
  const isStopped = message.status === 'stopped';
  const isError = message.status === 'error';

  return (
    <div
      className={`flex gap-3.5 ${isUser ? 'justify-end' : 'justify-start'} group transition-all`}
    >
      {!isUser && (
        <div
          aria-hidden="true"
          className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 border border-indigo-400/30 flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-600/15"
        >
          <Bot className="w-4 h-4 text-white" />
        </div>
      )}

      <div className={`max-w-2xl space-y-2 ${isUser ? 'items-end' : 'items-start'} min-w-0`}>
        <div
          className={`p-4 rounded-2xl shadow-md transition-shadow ${
            isUser
              ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-tr-none text-xs leading-relaxed'
              : 'bg-[#151d35] border border-slate-800/90 text-slate-200 rounded-tl-none'
          }`}
        >
          {isWaiting ? (
            <div className="space-y-2">
              {message.activeTool && (
                <div className="flex items-center gap-2 text-[11px] text-indigo-300 font-medium bg-indigo-950/60 border border-indigo-500/25 px-2.5 py-1.5 rounded-xl">
                  {message.activeTool.name === 'searchKnowledgeBase' ? (
                    <Search className="w-3.5 h-3.5 text-indigo-400 animate-spin motion-reduce:animate-none flex-shrink-0" />
                  ) : message.activeTool.name === 'getDocumentDetails' ? (
                    <FileText className="w-3.5 h-3.5 text-indigo-400 animate-pulse motion-reduce:animate-none flex-shrink-0" />
                  ) : (
                    <Wrench className="w-3.5 h-3.5 text-indigo-400 animate-pulse motion-reduce:animate-none flex-shrink-0" />
                  )}
                  <span className="truncate max-w-[280px]">
                    {message.activeTool.name === 'searchKnowledgeBase'
                      ? `Searching: ${message.activeTool.argsSummary || 'knowledge base'}`
                      : message.activeTool.name === 'getDocumentDetails'
                      ? `Checking: ${message.activeTool.argsSummary || 'document'}`
                      : `Tool: ${message.activeTool.name}`}
                  </span>
                </div>
              )}
              <TypingIndicator />
            </div>
          ) : isUser ? (
            <p className="whitespace-pre-wrap">{message.text}</p>
          ) : (
            <MarkdownRenderer
              content={message.text}
              isStreaming={isStreaming}
            />
          )}

          {/* Stopped indicator badge */}
          {isStopped && (
            <div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-slate-800/80 text-[10px] text-amber-400/90 font-medium">
              <Square className="w-2.5 h-2.5 fill-current" />
              <span>Generation stopped</span>
            </div>
          )}

          {/* Inline Error Message + Retry Button */}
          {isError && (
            <div
              role="alert"
              className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-xl space-y-2 text-xs"
            >
              <div className="flex items-start gap-2 text-red-300">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <span className="leading-snug">{message.error || 'Failed to complete response'}</span>
              </div>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  aria-label="Retry generating answer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/30 rounded-lg text-[11px] font-semibold transition"
                >
                  <RotateCcw className="w-3 h-3" />
                  Retry
                </button>
              )}
            </div>
          )}
        </div>

        {/* Sources & Citations */}
        {message.sources && message.sources.length > 0 && (
          <div
            className="flex gap-2 flex-wrap pt-0.5"
            aria-label="Cited sources"
          >
            {message.sources.map((src, i) => {
              const title = src.documentTitle || (src as unknown as { title?: string }).title || 'Document';
              const page = src.pageNumber;
              const sim = typeof src.similarity === 'number'
                ? src.similarity
                : ((src as unknown as { score?: number }).score ?? 0);

              return (
                <div
                  key={i}
                  className="flex items-center gap-1.5 bg-[#0f1629] border border-indigo-500/30 text-indigo-300 text-[10px] px-2.5 py-1 rounded-lg shadow-sm"
                >
                  <BookOpen className="w-3 h-3 text-indigo-400" aria-hidden="true" />
                  <span className="font-semibold truncate max-w-[150px]">{title}</span>
                  {page != null && <span className="text-slate-500">p.{page}</span>}
                  <span className="text-emerald-400 font-mono">
                    ({Math.round(sim * 100)}%)
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {isUser && (
        <div
          aria-hidden="true"
          className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0 shadow-md"
        >
          <User className="w-4 h-4 text-slate-300" />
        </div>
      )}
    </div>
  );
}
