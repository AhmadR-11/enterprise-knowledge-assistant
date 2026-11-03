'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles, FileText, ShieldCheck, Compass, ArrowRight } from 'lucide-react';

interface EmptyChatStateProps {
  onSelectPrompt: (prompt: string) => void;
}

const SUGGESTED_PROMPTS = [
  {
    icon: FileText,
    title: 'Workspace Documentation Overview',
    description: 'Summarize the primary guidelines and documentation available in our space.',
    prompt: 'Give me an executive summary of the key documentation available in this space.'
  },
  {
    icon: ShieldCheck,
    title: 'Security & Team Guidelines',
    description: 'Review access rules, data privacy, and operational best practices.',
    prompt: 'What are the main security guidelines and data handling policies documented here?'
  },
  {
    icon: Compass,
    title: 'Role Permissions & Workflows',
    description: 'Understand how spaces, editor permissions, and admin controls function.',
    prompt: 'How do space memberships, editor capabilities, and role permissions work across our assistant?'
  }
];

export function EmptyChatState({ onSelectPrompt }: EmptyChatStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center max-w-2xl mx-auto space-y-6">
      {/* Icon Badge */}
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600/30 to-purple-600/30 border border-indigo-500/40 flex items-center justify-center shadow-xl shadow-indigo-600/10"
      >
        <Sparkles className="w-7 h-7 text-indigo-400" />
      </motion.div>

      {/* Heading */}
      <div className="space-y-1.5">
        <h2 className="text-xl font-bold text-white tracking-tight">
          How can I assist your enterprise today?
        </h2>
        <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
          Ask questions across all indexed documentation in your assigned spaces. RAG embeddings ground every response in verified sources.
        </p>
      </div>

      {/* Suggested Prompt Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full pt-2">
        {SUGGESTED_PROMPTS.map((item, idx) => {
          const Icon = item.icon;
          return (
            <motion.button
              key={idx}
              type="button"
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onSelectPrompt(item.prompt)}
              className="flex flex-col text-left p-3.5 rounded-xl bg-[#131b30]/80 hover:bg-[#182340] border border-slate-800 hover:border-indigo-500/40 transition-all shadow-sm group"
            >
              <div className="w-7 h-7 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center mb-2.5 group-hover:bg-indigo-600/30 transition-colors">
                <Icon className="w-3.5 h-3.5 text-indigo-400" />
              </div>
              <h3 className="text-xs font-semibold text-white mb-1 group-hover:text-indigo-300 transition-colors">
                {item.title}
              </h3>
              <p className="text-[11px] text-slate-400 leading-normal flex-1">
                {item.description}
              </p>
              <div className="flex items-center gap-1 text-[10px] text-indigo-400 font-medium mt-2.5 pt-2 border-t border-slate-800/60 opacity-80 group-hover:opacity-100">
                <span>Ask prompt</span>
                <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

