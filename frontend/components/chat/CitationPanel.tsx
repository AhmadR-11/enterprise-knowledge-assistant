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

  useEffect(() => {
    if (!isOpen) return;

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
      if (triggerRef?.current) {
        triggerRef.current.focus();
      }
    };
  }, [isOpen, onClose, triggerRef]);

  const handleCopySnippet = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
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
          transition={{ duration: 0.15 }}
          onClick={onClose}
          className="fixed inset-0 bg-surface-overlay"
          aria-hidden="true"
        />

        {/* Slide-over Drawer (surface-1, hairline border) */}
        <motion.aside
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="citation-panel-title"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 320 }}
          className="relative w-full max-w-md bg-surface-1 border-l border-border shadow-popover z-10 flex flex-col h-full text-text-primary"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border bg-surface-1">
            <div className="flex items-center gap-2.5 min-w-0 pr-2">
              <div className="w-7 h-7 rounded-control bg-surface-2 border border-border flex items-center justify-center flex-shrink-0 text-accent">
                <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
              </div>
              <div>
                <h2
                  id="citation-panel-title"
                  className="text-xs font-semibold text-text-primary tracking-tight truncate"
                >
                  Document Citation
                </h2>
                <p className="text-[10px] text-text-muted truncate">
                  Source verification & metadata details
                </p>
              </div>
            </div>

            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="Close citation details panel"
              className="p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-2 rounded-control transition focus:outline-none focus:ring-2 focus:ring-accent-border"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Title Header */}
            <div className="space-y-1">
              <span className="text-2xs font-semibold uppercase tracking-wider text-accent">
                Source Document
              </span>
              <h3 className="text-sm font-semibold text-text-primary break-words leading-snug">
                {displayTitle}
              </h3>
            </div>

            {/* Key Metadata Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-control bg-surface-2 border border-border space-y-1">
                <div className="flex items-center gap-1.5 text-text-muted text-[11px]">
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Space</span>
                </div>
                <p className="font-medium text-text-primary truncate">{displaySpace}</p>
              </div>

              {similarityScore != null && (
                <div className="p-2.5 rounded-control bg-surface-2 border border-border space-y-1">
                  <div className="flex items-center gap-1.5 text-text-muted text-[11px]">
                    <Layers className="w-3.5 h-3.5 text-accent" />
                    <span>Relevance</span>
                  </div>
                  <p className="font-mono tabular-nums font-semibold text-accent">
                    {similarityScore}% Match
                  </p>
                </div>
              )}

              {citation?.pageNumber != null && (
                <div className="p-2.5 rounded-control bg-surface-2 border border-border space-y-1">
                  <div className="flex items-center gap-1.5 text-text-muted text-[11px]">
                    <FileText className="w-3.5 h-3.5" />
                    <span>Page</span>
                  </div>
                  <p className="font-medium text-text-primary">Page {citation.pageNumber}</p>
                </div>
              )}

              {displayDate && (
                <div className="p-2.5 rounded-control bg-surface-2 border border-border space-y-1">
                  <div className="flex items-center gap-1.5 text-text-muted text-[11px]">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Uploaded</span>
                  </div>
                  <p className="font-medium text-text-secondary">{displayDate}</p>
                </div>
              )}
            </div>

            {/* Loading State */}
            {loading && (
              <div
                role="status"
                aria-label="Loading document snippet details"
                className="py-10 flex flex-col items-center justify-center space-y-2 text-text-muted"
              >
                <Loader2 className="w-5 h-5 text-accent animate-spin" />
                <p className="text-xs">Loading document excerpt…</p>
              </div>
            )}

            {/* Error State */}
            {!loading && error && (
              <div
                role="alert"
                className="p-3 bg-danger/10 border border-danger/20 rounded-card space-y-2.5 text-xs text-text-primary"
              >
                <div className="flex items-start gap-2 text-danger">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span className="leading-snug">{error}</span>
                </div>
                {citation?.documentId && (
                  <button
                    type="button"
                    onClick={() => fetchSummary(citation.documentId!)}
                    className="btn-ghost text-xs border border-danger/30 text-danger hover:bg-danger/20 py-1"
                  >
                    <RotateCcw className="w-3 h-3 mr-1" />
                    Retry
                  </button>
                )}
              </div>
            )}

            {/* Excerpt Section */}
            {!loading && !error && snippet && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-2xs font-semibold uppercase tracking-wider text-text-muted">
                    Relevant Excerpt
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopySnippet(snippet)}
                    className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text-primary px-1.5 py-0.5 rounded-control transition"
                    aria-label={copied ? 'Excerpt copied to clipboard' : 'Copy excerpt'}
                  >
                    {copied ? (
                      <>
                        <Check className="w-3 h-3 text-accent" />
                        <span className="text-accent">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="p-3 bg-surface-2 border border-border rounded-card font-mono text-[12px] text-text-secondary leading-relaxed max-h-64 overflow-y-auto whitespace-pre-wrap">
                  {snippet}
                </div>
              </div>
            )}

            {!loading && !error && !snippet && (
              <div className="p-3 bg-surface-2 border border-border rounded-card text-xs text-text-muted leading-relaxed">
                This document was indexed and cited by vector similarity. The preview snippet is currently unavailable, but full space members can view this document in the Documents repository.
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-border bg-surface-1 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="btn-ghost text-xs py-1.5 px-3 rounded-control border border-border text-text-secondary hover:text-text-primary"
            >
              Close
            </button>
          </div>
        </motion.aside>
      </div>
    </AnimatePresence>
  );
}
