'use client';

import React, { useRef, useEffect } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { StreamStatus } from '@/hooks/useChatStream';

interface ChatInputProps {
  input: string;
  onChange: (val: string) => void;
  onSend: () => void;
  onStop: () => void;
  status: StreamStatus;
  placeholder?: string;
}

export function ChatInput({
  input,
  onChange,
  onSend,
  onStop,
  status,
  placeholder = 'Ask a question about documents in your space(s)...'
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isBusy = status === 'waiting' || status === 'streaming';

  // Auto-grow textarea up to 6 lines (~150px)
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
    }
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      if (isBusy) {
        e.preventDefault();
        onStop();
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      if (!isBusy && input.trim()) {
        e.preventDefault();
        onSend();
      }
    }
  };

  useEffect(() => {
    if (status === 'idle' || status === 'stopped' || status === 'error') {
      textareaRef.current?.focus();
    }
  }, [status]);

  return (
    <div className="w-full max-w-[760px] mx-auto">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (isBusy) {
            onStop();
          } else if (input.trim()) {
            onSend();
          }
        }}
        className="flex items-end gap-2 bg-surface-1 border border-border p-2 rounded-composer shadow-card focus-within:border-accent-border focus-within:ring-2 focus-within:ring-accent-soft transition-all duration-150"
      >
        <textarea
          ref={textareaRef}
          rows={1}
          className="flex-1 bg-transparent border-0 px-3 py-1.5 text-chat text-text-primary focus:outline-none placeholder:text-text-muted resize-none leading-relaxed min-h-[36px] max-h-[150px]"
          placeholder={placeholder}
          value={input}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Chat input message"
        />

        {isBusy ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop generating answer (or press Escape)"
            title="Stop generating (Esc)"
            className="w-9 h-9 rounded-control bg-surface-3 hover:bg-surface-2 border border-border-strong text-text-primary flex items-center justify-center flex-shrink-0 transition-all duration-150 shadow-subtle"
          >
            <Square className="w-3.5 h-3.5 fill-current animate-pulse motion-reduce:animate-none" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            aria-label="Send message"
            title="Send message (Enter)"
            className="w-9 h-9 rounded-control bg-accent-fill text-accent-text flex items-center justify-center flex-shrink-0 transition-all duration-150 hover:brightness-105 active:scale-95 disabled:opacity-35 disabled:cursor-not-allowed shadow-subtle"
          >
            <ArrowUp className="w-4 h-4 stroke-[2.5]" />
          </button>
        )}
      </form>

      <div className="text-center text-2xs text-text-muted mt-1.5 select-none">
        <span>Enter to send, Shift+Enter for a new line</span>
      </div>
    </div>
  );
}
