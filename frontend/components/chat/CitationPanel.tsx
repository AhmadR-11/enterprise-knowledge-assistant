'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  BookOpen,
  Building2,
  Calendar,
  Layers,
  Copy,
  Check,
  AlertCircle,
  RotateCcw,
  Loader2,
  FileText
} from 'lucide-react';
import api from '@/lib/api';
import { ChatSource, DocumentSummary, ApiResponse } from '@/types';

export interface CitationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  citation: ChatSource | null;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
}

export function CitationPanel({
  isOpen,
  onClose,
  citation,
  triggerRef
}: CitationPanelProps) {
  const [summary, setSummary] = useState<DocumentSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  /**
   * Fetch document summary details from backend API
   */
  const fetchSummary = useCallback(async (docId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<ApiResponse<DocumentSummary>>(`/documents/${docId}/summary`);
      if (res.data?.success && res.data.data) {
        setSummary(res.data.data);
      } else {
        throw new Error(res.data?.message || 'Failed to load document details');
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      setError(e.response?.data?.message || e.message || 'Failed to load document metadata');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch whenever panel opens with a citation
  useEffect(() => {
    if (isOpen && citation?.documentId) {
      fetchSummary(citation.documentId);
    } else if (isOpen && !citation?.documentId) {
      setSummary(null);
      setLoading(false);
      setError(null);
    } else {
      setSummary(null);
      setError(null);
      setLoading(false);
    }
  }, [isOpen, citation, fetchSummary]);

  /**
   * Focus Trap & Keyboard Navigation (Escape to close, Tab cycle, Return focus)
   */
  useEffect(() => {
    if (!isOpen) return;

    // Focus close button on open
    const timer = setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const firstElement = focusable[0];
        const lastElement = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
      // Return focus to trigger element
      if (triggerRef?.current) {
        triggerRef.current.focus();
      }
    };
  }, [isOpen, onClose, triggerRef]);

  /**
   * Copy snippet excerpt to clipboard
   */
  const handleCopySnippet = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  if (!isOpen) return null;

  const displayTitle = summary?.title || citation?.documentTitle || 'Document Citation';
  const displaySpace = summary?.spaceName || 'Workspace';
  const displayDate = summary?.createdAt
    ? new Date(summary.createdAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    : null;
  const similarityScore = citation ? Math.round(citation.similarity * 100) : null;
  const snippet = summary?.previewSnippet;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          aria-hidden="true"
        />

        {/* Slide-over Panel */}
        <motion.aside
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="citation-panel-title"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="relative w-full max-w-md bg-[#0d1427] border-l border-slate-800/90 shadow-2xl z-10 flex flex-col h-full text-slate-200"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 md:p-5 border-b border-slate-800/80 bg-[#101830]">
            <div className="flex items-center gap-2.5 min-w-0 pr-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0 text-indigo-400">
                <BookOpen className="w-4 h-4" aria-hidden="true" />
              </div>
              <div>
                <h2
                  id="citation-panel-title"
                  className="text-sm font-semibold text-white tracking-wide truncate"
                >
                  Document Citation
                </h2>
                <p className="text-[11px] text-slate-400 truncate">
                  Source verification & metadata details
                </p>
              </div>
            </div>

            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="Close citation details panel"
              style={{ cursor: 'pointer' }}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-xl transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-[#0d1427]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content Body */}
          <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-5">
            {/* Document Title Header */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                Source Document
              </span>
              <h3 className="text-base font-bold text-white break-words leading-snug">
                {displayTitle}
              </h3>
            </div>

            {/* Key Metadata Badges */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-3 rounded-xl bg-[#151d35] border border-slate-800 space-y-1">
                <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                  <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Space</span>
                </div>
                <p className="font-semibold text-white truncate">{displaySpace}</p>
              </div>

              {similarityScore != null && (
                <div className="p-3 rounded-xl bg-[#151d35] border border-slate-800 space-y-1">
                  <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                    <Layers className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Relevance</span>
                  </div>
                  <p className="font-semibold text-emerald-400 font-mono">
                    {similarityScore}% Match
                  </p>
                </div>
              )}

              {citation?.pageNumber != null && (
                <div className="p-3 rounded-xl bg-[#151d35] border border-slate-800 space-y-1">
                  <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                    <FileText className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Page</span>
                  </div>
                  <p className="font-semibold text-white">Page {citation.pageNumber}</p>
                </div>
              )}

              {displayDate && (
                <div className="p-3 rounded-xl bg-[#151d35] border border-slate-800 space-y-1">
                  <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>Uploaded</span>
                  </div>
                  <p className="font-semibold text-slate-200">{displayDate}</p>
                </div>
              )}
            </div>

            {/* Loading State */}
            {loading && (
              <div
                role="status"
                aria-label="Loading document snippet details"
                className="py-10 flex flex-col items-center justify-center space-y-3"
              >
                <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
                <p className="text-xs text-slate-400">Loading document excerpt…</p>
              </div>
            )}

            {/* Error State */}
            {!loading && error && (
              <div
                role="alert"
                className="p-4 bg-red-500/10 border border-red-500/25 rounded-xl space-y-3"
              >
                <div className="flex items-start gap-2.5 text-red-300 text-xs">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{error}</span>
                </div>
                {citation?.documentId && (
                  <button
                    type="button"
                    onClick={() => fetchSummary(citation.documentId!)}
                    style={{ cursor: 'pointer' }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-200 text-xs font-semibold rounded-lg border border-red-500/30 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Retry
                  </button>
                )}
              </div>
            )}

            {/* Preview Snippet / Excerpt */}
            {!loading && !error && snippet && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Relevant Excerpt
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopySnippet(snippet)}
                    style={{ cursor: 'pointer' }}
                    className="flex items-center gap-1 text-[11px] text-indigo-300 hover:text-indigo-200 transition cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-400 rounded px-1.5 py-0.5"
                    aria-label={copied ? 'Excerpt copied to clipboard' : 'Copy excerpt'}
                  >
                    {copied ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="p-3.5 bg-[#080d1a] border border-slate-800 rounded-xl font-mono text-xs text-slate-300 leading-relaxed max-h-64 overflow-y-auto whitespace-pre-wrap selection:bg-indigo-600 selection:text-white">
                  {snippet}
                </div>
              </div>
            )}

            {/* Empty Snippet Fallback */}
            {!loading && !error && !snippet && (
              <div className="p-4 bg-[#151d35]/50 border border-slate-800/80 rounded-xl text-xs text-slate-400 leading-relaxed">
                This document was indexed and cited by vector similarity. The preview snippet is currently unavailable, but full space members can view this document in the Documents repository.
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-800/80 bg-[#101830] flex justify-end">
            <button
              type="button"
              onClick={onClose}
              style={{ cursor: 'pointer' }}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-[#0d1427]"
            >
              Close
            </button>
          </div>
        </motion.aside>
      </div>
    </AnimatePresence>
  );
}

