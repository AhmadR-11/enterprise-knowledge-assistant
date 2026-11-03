'use client';

import React, { useRef, useEffect } from 'react';
import { Send, Square } from 'lucide-react';
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
  const inputRef = useRef<HTMLInputElement>(null);
  const isBusy = status === 'waiting' || status === 'streaming';

  // Handle keyboard shortcuts (Enter to send, Escape to stop)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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

  // Re-focus input after stopping or completion so drafting continues smoothly
  useEffect(() => {
    if (status === 'idle' || status === 'stopped' || status === 'error') {
      inputRef.current?.focus();
    }
  }, [status]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (isBusy) {
          onStop();
        } else if (input.trim()) {
          onSend();
        }
      }}
      className="flex gap-2 bg-[#0f1629] border border-slate-800/80 p-2 rounded-2xl shadow-xl focus-within:border-indigo-500/60 transition-all"
    >
      <input
        ref={inputRef}
        type="text"
        className="flex-1 bg-transparent border-0 px-3 text-sm text-white focus:outline-none placeholder:text-slate-500"
        placeholder={placeholder}
        value={input}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        aria-label="Chat input message"
        // Drafting allowed: do NOT disable input while streaming!
      />

      {isBusy ? (
        <button
          type="button"
          onClick={onStop}
          aria-label="Stop generating answer (or press Escape)"
          title="Stop generating (Esc)"
          className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-semibold shadow-md transition"
        >
          <Square className="w-3.5 h-3.5 fill-current animate-pulse motion-reduce:animate-none" />
          <span>Stop</span>
        </button>
      ) : (
        <button
          type="submit"
          disabled={!input.trim()}
          aria-label="Send message"
          title="Send message (Enter)"
          className="btn-primary p-3 rounded-xl shadow-lg shadow-indigo-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          <Send className="w-4 h-4" />
        </button>
      )}
    </form>
  );
}

