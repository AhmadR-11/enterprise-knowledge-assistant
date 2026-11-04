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
      {/* Subtle Monochrome Hero Mark */}
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="w-10 h-10 rounded-card bg-surface-2 border border-border flex items-center justify-center shadow-subtle text-accent"
      >
        <Sparkles className="w-5 h-5" />
      </motion.div>

      {/* Hero Heading */}
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold text-text-primary tracking-tight">
          How can I assist your enterprise today?
        </h2>
        <p className="text-xs text-text-muted max-w-md mx-auto leading-relaxed">
          Ask questions across indexed documentation in your assigned spaces. RAG embeddings ground every response with verified citations.
        </p>
      </div>

      {/* 2x2 Suggested Prompt Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full pt-1 text-left">
        {SUGGESTED_PROMPTS.map((item, idx) => {
          const Icon = item.icon;
          return (
            <motion.button
              key={idx}
              type="button"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => onSelectPrompt(item.prompt)}
              className="flex flex-col p-3.5 rounded-card bg-surface-1 hover:bg-surface-2 border border-border hover:border-border-strong transition-all duration-150 text-left shadow-subtle group"
            >
              <div className="w-7 h-7 rounded-control bg-surface-2 border border-border flex items-center justify-center mb-2.5 text-text-muted group-hover:text-accent transition-colors">
                <Icon className="w-3.5 h-3.5" />
              </div>
              <h3 className="text-xs font-semibold text-text-primary mb-1 group-hover:text-text-primary transition-colors">
                {item.title}
              </h3>
              <p className="text-[11px] text-text-muted leading-relaxed line-clamp-2">
                {item.description}
              </p>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
