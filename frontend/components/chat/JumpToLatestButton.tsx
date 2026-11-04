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
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.96 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 pointer-events-auto"
        >
          <button
            type="button"
            onClick={onClick}
            aria-label="Jump to latest message"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-2 hover:bg-surface-3 text-text-primary border border-border-strong rounded-full shadow-popover text-xs font-medium backdrop-blur-md transition-all duration-150"
          >
            <ArrowDown className="w-3.5 h-3.5 text-text-muted" />
            <span>Jump to latest</span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
