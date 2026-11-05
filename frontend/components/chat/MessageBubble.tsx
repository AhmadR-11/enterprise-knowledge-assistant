'use client';

import React, { useState, useRef } from 'react';
import { Bot, BookOpen, AlertCircle, RotateCcw, Square } from 'lucide-react';
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
  const hasSources = Boolean(message.sources && message.sources.length > 0);

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
          className="w-7 h-7 rounded-control bg-surface-2 border border-border flex items-center justify-center flex-shrink-0 text-text-muted mt-0.5 shadow-sm"
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
          /* User Message: right aligned, surface-2 background, 1px border, radius 18px */
          <div className="bg-surface-2 border border-border text-text-primary px-4 py-2.5 rounded-[18px] text-chat leading-relaxed shadow-sm">
            <p className="whitespace-pre-wrap">{message.text}</p>
          </div>
        ) : (
          /* Assistant Answer: renders clean prose directly on the background (no heavy card) */
          <div className="w-full text-text-primary">
            {/* Tool Activity & Sources Row above the answer text */}
            {(hasToolActivities || hasSources) && (
              <div className="space-y-2 mb-2">
                {hasToolActivities && (
                  <ToolActivity activities={message.toolActivities} />
                )}

                {hasSources && (
                  <div
                    className="flex gap-1.5 flex-wrap"
                    aria-label="Cited sources"
                  >
                    {message.sources!.map((src, i) => {
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
                          className="inline-flex items-center gap-1.5 bg-surface-1 hover:bg-surface-2 active:bg-surface-2 border border-border hover:border-border-strong text-text-secondary hover:text-text-primary text-[11px] px-2.5 py-1 min-h-[28px] rounded-control shadow-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent text-left"
                        >
                          <BookOpen className="w-3 h-3 text-text-muted flex-shrink-0" aria-hidden="true" />
                          <span className="font-medium truncate max-w-[160px]">{title}</span>
                          {page != null && <span className="text-text-muted">p.{page}</span>}
                          <span className="text-text-muted tabular-nums text-[10px]">
                            {percent}%
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
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

            {/* Stopped Indicator */}
            {isStopped && (
              <div className="flex items-center gap-1.5 mt-2 pt-1.5 text-xs text-text-muted font-medium">
                <Square className="w-2.5 h-2.5 fill-current" />
                <span>Generation stopped</span>
              </div>
            )}

            {/* Inline Error Card with Retry (soft tinted surface danger-soft, 1px danger-border) */}
            {isError && (
              <div
                role="alert"
                className="mt-2.5 p-3 bg-danger-soft border border-danger-border rounded-card space-y-2 text-xs text-text-primary"
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
                    className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 bg-surface-2 hover:bg-surface-3 active:bg-surface-3 text-text-primary border border-border-strong rounded-control text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-text-muted" />
                    <span>Retry</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

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
