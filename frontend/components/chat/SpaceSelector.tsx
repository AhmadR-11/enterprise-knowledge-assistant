'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Building2, Check, ChevronDown } from 'lucide-react';
import { Space } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';

interface SpaceSelectorProps {
  spaces: Space[];
  selectedSpaceId: string;
  onSelectSpace: (id: string) => void;
}

export function SpaceSelector({ spaces, selectedSpaceId, onSelectSpace }: SpaceSelectorProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedSpace = spaces.find((s) => String(s.id) === selectedSpaceId);
  const displayLabel = selectedSpace ? selectedSpace.name : 'All Accessible Spaces';

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };

    if (open) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Filter documents by space"
        className="flex items-center gap-2 h-8 px-2.5 rounded-control bg-surface-2 hover:bg-surface-3 border border-border hover:border-border-strong text-xs font-medium text-text-primary transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-accent-border"
      >
        <Building2 className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
        <span className="truncate max-w-[140px] md:max-w-[180px]">{displayLabel}</span>
        <ChevronDown className="w-3 h-3 text-text-muted flex-shrink-0" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            role="listbox"
            aria-label="Accessible spaces"
            className="absolute right-0 mt-1.5 w-64 rounded-card bg-surface-1 border border-border-strong shadow-popover z-50 py-1 overflow-hidden"
          >
            <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted border-b border-border">
              Select Workspace
            </div>

            <div className="max-h-60 overflow-y-auto p-1 space-y-0.5">
              <button
                type="button"
                role="option"
                aria-selected={!selectedSpaceId}
                onClick={() => {
                  onSelectSpace('');
                  setOpen(false);
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-control text-xs transition-colors ${
                  !selectedSpaceId
                    ? 'bg-surface-2 text-text-primary font-medium'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <Building2 className="w-3.5 h-3.5 text-text-muted" />
                  <span className="truncate">All Accessible Spaces</span>
                </div>
                {!selectedSpaceId && <Check className="w-3.5 h-3.5 text-accent flex-shrink-0" />}
              </button>

              {spaces.map((s) => {
                const isSelected = selectedSpaceId === String(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onSelectSpace(String(s.id));
                      setOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-control text-xs transition-colors ${
                      isSelected
                        ? 'bg-surface-2 text-text-primary font-medium'
                        : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Building2 className="w-3.5 h-3.5 text-text-muted" />
                      <span className="truncate">{s.name}</span>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-accent flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

