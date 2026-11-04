'use client';

import React, { useState, useRef } from 'react';
import { Bot, User, BookOpen, AlertCircle, RotateCcw, Square } from 'lucide-react';
import { ChatMessage, ChatSource } from '@/types';
import { TypingIndicator } from './TypingIndicator';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ToolActivity } from './ToolActivity';
import { CitationPanel } from './CitationPanel';
import clsx from 'clsx';

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
      className={clsx(
        'flex gap-3 w-full py-1',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      {/* Assistant Avatar Mark (28px clean neutral) */}
      {!isUser && (
        <div
          aria-hidden="true"
          className="w-7 h-7 rounded-control bg-surface-2 border border-border flex items-center justify-center flex-shrink-0 text-text-muted mt-0.5 shadow-subtle"
        >
          <Bot className="w-3.5 h-3.5 text-accent" />
        </div>
      )}

      {/* Message Content Container */}
      <div
        className={clsx(
          'flex flex-col min-w-0',
          isUser ? 'max-w-[70%] items-end' : 'flex-1 max-w-full'
        )}
      >
        {isUser ? (
          /* User Message: surface-2, 1px border, radius 18px, crisp typography */
          <div className="bg-surface-2 border border-border text-text-primary px-4 py-2.5 rounded-bubble text-chat leading-relaxed shadow-subtle">
            <p className="whitespace-pre-wrap">{message.text}</p>
          </div>
        ) : (
          /* Assistant Answer: renders clean prose directly on the background (no heavy card) */
          <div className="w-full text-text-primary">
            {/* Tool Activity Status Row */}
            {hasToolActivities && (
              <ToolActivity activities={message.toolActivities} />
            )}

            {/* Answer Body */}
            {isWaiting ? (
              hasToolActivities ? null : <TypingIndicator />
            ) : (
              <div className="py-0.5">
                <MarkdownRenderer
                  content={message.text}
                  isStreaming={isStreaming}
                  sources={message.sources}
                  onOpenCitation={(src, triggerEl) => handleOpenCitation(src, undefined, triggerEl)}
                />
              </div>
            )}

            {/* Source Citation Chips */}
            {message.sources && message.sources.length > 0 && (
              <div
                className="flex gap-1.5 flex-wrap pt-2.5"
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
                      className="inline-flex items-center gap-1.5 bg-surface-1 hover:bg-surface-2 border border-border hover:border-border-strong text-text-secondary hover:text-text-primary text-[11px] px-2.5 py-1 rounded-control shadow-subtle transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-accent-border text-left"
                    >
                      <BookOpen className="w-3 h-3 text-text-muted flex-shrink-0" aria-hidden="true" />
                      <span className="font-medium truncate max-w-[160px]">{title}</span>
                      {page != null && <span className="text-text-muted">p.{page}</span>}
                      <span className="text-text-muted font-mono tabular-nums text-[10px]">
                        {percent}%
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Stopped Indicator */}
            {isStopped && (
              <div className="flex items-center gap-1.5 mt-2 pt-1.5 text-2xs text-text-muted font-medium">
                <Square className="w-2.5 h-2.5 fill-current" />
                <span>Generation stopped</span>
              </div>
            )}

            {/* Inline Error Card with Retry */}
            {isError && (
              <div
                role="alert"
                className="mt-2.5 p-3 bg-danger/10 border border-danger/25 rounded-card space-y-2 text-xs text-text-primary"
              >
                <div className="flex items-start gap-2 text-danger">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span className="leading-snug">{message.error || 'Failed to complete response'}</span>
                </div>
                {onRetry && (
                  <button
                    type="button"
                    onClick={onRetry}
                    aria-label="Retry generating answer"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-surface-2 hover:bg-surface-3 text-text-primary border border-border-strong rounded-control text-[11px] font-medium transition"
                  >
                    <RotateCcw className="w-3 h-3 text-text-muted" />
                    <span>Retry</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* User Avatar Mark */}
      {isUser && (
        <div
          aria-hidden="true"
          className="w-7 h-7 rounded-control bg-surface-2 border border-border flex items-center justify-center flex-shrink-0 text-text-muted mt-0.5 shadow-subtle"
        >
          <User className="w-3.5 h-3.5 text-text-muted" />
        </div>
      )}

      {/* Slide-over Citation Details Drawer */}
      <CitationPanel
        isOpen={isCitationOpen}
        onClose={() => setIsCitationOpen(false)}
        citation={selectedCitation}
        triggerRef={activeTriggerRef}
      />
    </div>
  );
}
