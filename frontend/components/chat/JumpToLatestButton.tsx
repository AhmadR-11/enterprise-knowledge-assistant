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
          initial={{ opacity: 0, y: 4, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.96 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="relative z-20 flex justify-center -mt-10 mb-3 pointer-events-none"
        >
          <button
            type="button"
            onClick={onClick}
            aria-label="Jump to latest message"
            className="pointer-events-auto inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] bg-surface-2 hover:bg-surface-3 active:bg-surface-3 text-text-primary border border-border-strong rounded-full shadow-sm text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-safe:active:scale-[0.98] motion-reduce:transform-none"
          >
            <ArrowDown className="w-3.5 h-3.5 text-text-muted" />
            <span>Jump to latest</span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
