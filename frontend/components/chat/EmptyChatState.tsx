'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles, FileText, ShieldCheck, Compass, Database } from 'lucide-react';

interface EmptyChatStateProps {
  onSelectPrompt: (prompt: string) => void;
}

const SUGGESTED_PROMPTS = [
  {
    icon: FileText,
    title: 'Workspace Documentation Overview',
    description: 'Summarize key guidelines and architectures available in this space.',
    prompt: 'Give me an executive summary of the key documentation available in this space.'
  },
  {
    icon: Database,
    title: 'System Architecture & Vector Search',
    description: 'Learn how Cortex handles PostgreSQL connection pooling, sharding, and pgvector.',
    prompt: 'How does Cortex handle database connection pooling and sharding?'
  },
  {
    icon: ShieldCheck,
    title: 'Security & Access Policies',
    description: 'Review access rules, data privacy, and operational compliance policies.',
    prompt: 'What are the main security guidelines and data handling policies documented here?'
  },
  {
    icon: Compass,
    title: 'Role Permissions & Workflows',
    description: 'Understand how spaces, editor capabilities, and admin controls operate.',
    prompt: 'How do space memberships, editor capabilities, and role permissions work across our assistant?'
  }
];

export function EmptyChatState({ onSelectPrompt }: EmptyChatStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 text-center max-w-2xl mx-auto space-y-6 select-none">
      {/* Calm Centered Hero Mark */}
      <motion.div
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.15 }}
        className="w-9 h-9 rounded-control bg-surface-2 border border-border flex items-center justify-center shadow-sm text-accent"
        aria-hidden="true"
      >
        <Sparkles className="w-4 h-4" />
      </motion.div>

      {/* One-line Greeting */}
      <div className="space-y-1.5">
        <h2 className="text-base md:text-lg font-semibold text-text-primary tracking-tight">
          How can I assist your enterprise today?
        </h2>
        <p className="text-xs text-text-muted max-w-md mx-auto leading-relaxed">
          Ask questions across indexed documentation in your assigned spaces.
        </p>
      </div>

      {/* 2x2 Suggested Prompt Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full pt-1 text-left">
        {SUGGESTED_PROMPTS.map((item, idx) => {
          const Icon = item.icon;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => onSelectPrompt(item.prompt)}
              className="flex flex-col p-3.5 rounded-card bg-surface-1 hover:bg-surface-2 active:bg-surface-2 border border-border hover:border-border-strong text-left shadow-sm group transition-colors duration-150 motion-safe:hover:-translate-y-0.5 motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <div className="w-7 h-7 rounded-control bg-surface-2 border border-border flex items-center justify-center mb-2.5 text-text-muted group-hover:text-accent transition-colors duration-150">
                <Icon className="w-3.5 h-3.5" aria-hidden="true" />
              </div>
              <h3 className="text-xs font-semibold text-text-primary mb-1">
                {item.title}
              </h3>
              <p className="text-[11px] text-text-muted leading-relaxed line-clamp-2">
                {item.description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
