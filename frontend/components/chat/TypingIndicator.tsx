'use client';

import React from 'react';

/**
 * Clean, quiet typing indicator (three muted dots with a soft pulse).
 * Respects prefers-reduced-motion using motion-reduce:animate-none.
 */
export function TypingIndicator() {
  return (
    <div
      role="status"
      aria-label="Assistant is thinking…"
      className="inline-flex items-center gap-1.5 py-1.5 px-1"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-pulse motion-reduce:animate-none" />
      <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-pulse [animation-delay:200ms] motion-reduce:animate-none" />
      <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-pulse [animation-delay:400ms] motion-reduce:animate-none" />
      <span className="sr-only">Searching knowledge base and drafting answer…</span>
    </div>
  );
}
