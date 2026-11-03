'use client';

import React from 'react';

/**
 * Accessible typing indicator (three animated bouncing dots).
 * Respects prefers-reduced-motion using motion-reduce:animate-none.
 */
export function TypingIndicator() {
  return (
    <div
      role="status"
      aria-label="Assistant is thinking..."
      className="flex items-center gap-1.5 py-1 px-1"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:-0.3s] motion-reduce:animate-none" />
      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:-0.15s] motion-reduce:animate-none" />
      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce motion-reduce:animate-none" />
      <span className="sr-only">Searching knowledge base and drafting answer...</span>
    </div>
  );
}

