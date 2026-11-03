'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowDown } from 'lucide-react';

interface JumpToLatestButtonProps {
  visible: boolean;
  onClick: () => void;
}

export function JumpToLatestButton({ visible, onClick }: JumpToLatestButtonProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20"
        >
          <button
            type="button"
            onClick={onClick}
            aria-label="Jump to latest message"
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#151d35] hover:bg-[#1c2748] text-slate-200 border border-indigo-500/40 rounded-full shadow-2xl text-xs font-semibold backdrop-blur-md transition-all hover:scale-105 active:scale-95"
          >
            <ArrowDown className="w-3.5 h-3.5 text-indigo-400 animate-bounce motion-reduce:animate-none" />
            <span>Jump to latest</span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

