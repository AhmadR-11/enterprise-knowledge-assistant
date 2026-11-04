'use client';

import React, { useState, useRef } from 'react';
import { Bot, User, BookOpen, AlertCircle, RotateCcw, Square } from 'lucide-react';
import { ChatMessage, ChatSource } from '@/types';
import { TypingIndicator } from './TypingIndicator';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ToolActivity } from './ToolActivity';
import { CitationPanel } from './CitationPanel';

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

  // Citation slide-over state & trigger focus management
  const [selectedCitation, setSelectedCitation] = useState<ChatSource | null>(null);
  const [isCitationOpen, setIsCitationOpen] = useState(false);
  const chipRefs = useRef<{ [key: number]: HTMLButtonElement | null }>({});
  const activeTriggerRef = useRef<HTMLButtonElement | null>(null);

  const hasToolActivities = Boolean(message.toolActivities && message.toolActivities.length > 0);

  const handleOpenCitation = (
    src: ChatSource,
    index?: number,
    triggerEl?: HTMLButtonElement | null
  ) => {
    if (triggerEl) {
      activeTriggerRef.current = triggerEl;
    } else if (typeof index === 'number' && chipRefs.current[index]) {
      activeTriggerRef.current = chipRefs.current[index];
    } else {
      activeTriggerRef.current = null;
    }
    setSelectedCitation(src);
    setIsCitationOpen(true);
  };

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
          {/* Tool Activity Status (rendered only when message used tools) */}
          {!isUser && hasToolActivities && (
            <ToolActivity activities={message.toolActivities} />
          )}

          {/* Assistant Message Body with smooth typing handover */}
          {isWaiting ? (
            hasToolActivities ? null : <TypingIndicator />
          ) : isUser ? (
            <p className="whitespace-pre-wrap">{message.text}</p>
          ) : (
            <MarkdownRenderer
              content={message.text}
              isStreaming={isStreaming}
              sources={message.sources}
              onOpenCitation={(src, triggerEl) => handleOpenCitation(src, undefined, triggerEl)}
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

        {/* Interactive Source Citation Chips */}
        {message.sources && message.sources.length > 0 && (
          <div
            className="flex gap-2 flex-wrap pt-0.5"
            aria-label="Cited sources"
          >
            {message.sources.map((src, i) => {
              const title = src.documentTitle || 'Document';
              const page = src.pageNumber;
              const sim = typeof src.similarity === 'number' ? src.similarity : 0;
              const percent = Math.round(sim * 100);

              return (
                <button
                  key={i}
                  ref={(el) => {
                    chipRefs.current[i] = el;
                  }}
                  type="button"
                  onClick={(e) => handleOpenCitation(src, i, e.currentTarget)}
                  aria-label={`View citation for ${title}${page ? `, page ${page}` : ''}, ${percent}% match`}
                  style={{ cursor: 'pointer' }}
                  className="flex items-center gap-1.5 bg-[#0f1629] hover:bg-[#151f38] border border-indigo-500/30 hover:border-indigo-400/60 text-indigo-300 text-[10px] px-2.5 py-1.5 rounded-lg shadow-sm transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 focus:ring-offset-[#0a0f1e] text-left"
                >
                  <BookOpen className="w-3 h-3 text-indigo-400 flex-shrink-0 cursor-pointer" aria-hidden="true" />
                  <span className="font-semibold truncate max-w-[150px] cursor-pointer">{title}</span>
                  {page != null && <span className="text-slate-500 cursor-pointer">p.{page}</span>}
                  <span className="text-emerald-400 font-mono font-medium cursor-pointer">
                    ({percent}%)
                  </span>
                </button>
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

      {/* Accessible Citation Detail Panel */}
      <CitationPanel
        isOpen={isCitationOpen}
        onClose={() => setIsCitationOpen(false)}
        citation={selectedCitation}
        triggerRef={activeTriggerRef}
      />
    </div>
  );
}
