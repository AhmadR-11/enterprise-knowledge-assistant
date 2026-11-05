'use client';

import React, { useState, useRef, useEffect, useId } from 'react';
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
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const listboxId = useId();

  // All options including the default "All Accessible Spaces"
  const allOptions = [
    { id: '', name: 'All Accessible Spaces' },
    ...spaces.map((s) => ({ id: String(s.id), name: s.name }))
  ];

  const selectedIndex = allOptions.findIndex((opt) => opt.id === selectedSpaceId);
  const selectedSpace = selectedIndex >= 0 ? allOptions[selectedIndex] : allOptions[0];
  const displayLabel = selectedSpace?.name || 'All Accessible Spaces';

  // Keep focus within bounds
  useEffect(() => {
    if (open) {
      const idx = selectedIndex >= 0 ? selectedIndex : 0;
      setFocusedIndex(idx);
      // Focus the selected item after opening
      requestAnimationFrame(() => {
        optionRefs.current[idx]?.focus();
      });
    }
  }, [open, selectedIndex]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    if (open) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [open]);

  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
  };

  const handleOptionKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = (index + 1) % allOptions.length;
      setFocusedIndex(next);
      optionRefs.current[next]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = (index - 1 + allOptions.length) % allOptions.length;
      setFocusedIndex(prev);
      optionRefs.current[prev]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      setFocusedIndex(0);
      optionRefs.current[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      const last = allOptions.length - 1;
      setFocusedIndex(last);
      optionRefs.current[last]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  const handleSelect = (id: string) => {
    onSelectSpace(id);
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={`Filter documents by space. Current: ${displayLabel}`}
        className="flex items-center gap-2 min-h-[36px] h-9 px-3 rounded-control bg-surface-2 hover:bg-surface-3 active:bg-surface-3 border border-border hover:border-border-strong text-xs font-medium text-text-primary transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Building2 className="w-3.5 h-3.5 text-text-muted flex-shrink-0" aria-hidden="true" />
        <span className="truncate max-w-[140px] md:max-w-[180px]">{displayLabel}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-text-muted flex-shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            id={listboxId}
            role="listbox"
            aria-label="Accessible spaces"
            className="absolute right-0 mt-1.5 w-64 rounded-card bg-surface-1 border border-border-strong shadow-md z-50 py-1 overflow-hidden"
          >
            <div className="px-3 py-2 text-xs font-medium text-text-muted border-b border-border">
              Select workspace
            </div>

            <div className="max-h-60 overflow-y-auto p-1 space-y-0.5">
              {allOptions.map((opt, idx) => {
                const isSelected = opt.id === selectedSpaceId;
                return (
                  <button
                    key={opt.id || 'all'}
                    ref={(el) => {
                      optionRefs.current[idx] = el;
                    }}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={focusedIndex === idx ? 0 : -1}
                    onClick={() => handleSelect(opt.id)}
                    onKeyDown={(e) => handleOptionKeyDown(e, idx)}
                    className={`w-full flex items-center justify-between min-h-[36px] px-2.5 py-1.5 rounded-control text-xs transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      isSelected
                        ? 'bg-surface-2 text-text-primary font-medium'
                        : 'text-text-secondary hover:text-text-primary hover:bg-surface-2 active:bg-surface-3'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Building2 className="w-3.5 h-3.5 text-text-muted flex-shrink-0" aria-hidden="true" />
                      <span className="truncate">{opt.name}</span>
                    </div>
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-accent flex-shrink-0" aria-hidden="true" />
                    )}
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
