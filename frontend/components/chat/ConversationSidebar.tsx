'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Loader2,
  Clock,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Conversation } from '@/types';
import api from '@/lib/api';
import { toast } from 'sonner';

export interface ConversationSidebarProps {
  activeId: string | null;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  refreshTrigger?: number;
}

/**
 * Formats ISO date string to a concise relative time string.
 */
function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay === 1) return 'Yesterday';
    if (diffDay < 7) return `${diffDay}d ago`;

    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return '';
  }
}

export function ConversationSidebar({
  activeId,
  onSelectConversation,
  onNewChat,
  isOpenMobile,
  onCloseMobile,
  refreshTrigger = 0
}: ConversationSidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Rename state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  // Delete confirmation state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchConversations = async () => {
    try {
      setError(null);
      const res = await api.get<{
        success: boolean;
        message?: string | { conversations?: Conversation[] };
        data?: { conversations?: Conversation[] } | Conversation[];
      }>('/conversations?limit=50');

      if (res.data?.success) {
        const payload = res.data.data;
        const list = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.conversations)
          ? payload.conversations
          : typeof res.data.message === 'object' && res.data.message !== null && Array.isArray((res.data.message as any).conversations)
          ? (res.data.message as any).conversations
          : [];

        setConversations(list);
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      setError(e.response?.data?.message || e.message || 'Failed to load conversations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConversations();
  }, [refreshTrigger]);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const handleStartRename = (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(conv.id);
    setEditTitle(conv.title);
    setDeletingId(null);
  };

  const handleSaveRename = async (id: string, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = editTitle.trim();
    if (!clean) {
      setEditingId(null);
      return;
    }

    try {
      const res = await api.patch<{ success: boolean; data: Conversation }>(`/conversations/${id}`, {
        title: clean
      });
      if (res.data?.success) {
        setConversations((prev) =>
          prev.map((c) => (c.id === id ? { ...c, title: clean, updated_at: new Date().toISOString() } : c))
        );
        toast.success('Conversation renamed');
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Failed to rename conversation');
    } finally {
      setEditingId(null);
    }
  };

  const handleCancelRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
  };

  const handleConfirmDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await api.delete(`/conversations/${id}`);
      if (res.data?.success) {
        setConversations((prev) => prev.filter((c) => c.id !== id));
        toast.success('Conversation deleted');
        if (activeId === id) {
          onNewChat();
        }
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Failed to delete conversation');
    } finally {
      setDeletingId(null);
    }
  };

  const content = (
    <div className="flex flex-col h-full bg-[#0a0f1e] border-r border-slate-800/80 w-72 md:w-80 flex-shrink-0 select-none">
      {/* Header & New Chat button */}
      <div className="p-3.5 border-b border-slate-800/80 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-indigo-400" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Chat History
            </h2>
          </div>
          {isOpenMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              style={{ cursor: 'pointer' }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition md:hidden"
              aria-label="Close conversation list"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            onNewChat();
            if (isOpenMobile) onCloseMobile();
          }}
          style={{ cursor: 'pointer' }}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-xl text-xs font-semibold shadow-md shadow-indigo-600/15 transition-all active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 focus:ring-offset-[#0a0f1e]"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Chat</span>
        </button>
      </div>

      {/* Conversations List */}
      <div
        role="navigation"
        aria-label="Previous chat conversations"
        className="flex-1 overflow-y-auto p-2 space-y-1"
      >
        {loading && (
          <div className="p-4 space-y-2.5">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="h-12 bg-slate-800/40 rounded-xl animate-pulse" />
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-300 space-y-2">
            <div className="flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={fetchConversations}
              style={{ cursor: 'pointer' }}
              className="text-[11px] underline hover:text-red-200"
            >
              Retry loading
            </button>
          </div>
        )}

        {!loading && !error && conversations.length === 0 && (
          <div className="py-12 px-4 text-center space-y-2">
            <div className="w-10 h-10 mx-auto rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-center text-slate-500">
              <MessageSquare className="w-5 h-5" />
            </div>
            <p className="text-xs font-medium text-slate-400">No conversations yet</p>
            <p className="text-[11px] text-slate-500">
              Your saved chats and answers will appear here.
            </p>
          </div>
        )}

        {!loading &&
          !error &&
          conversations.map((conv) => {
            const isActive = conv.id === activeId;
            const isEditing = editingId === conv.id;
            const isDeleting = deletingId === conv.id;

            return (
              <div
                key={conv.id}
                onClick={() => {
                  if (!isEditing && !isDeleting) {
                    onSelectConversation(conv.id);
                    if (isOpenMobile) onCloseMobile();
                  }
                }}
                style={{ cursor: 'pointer' }}
                className={`group relative flex items-center justify-between p-2.5 rounded-xl transition-all cursor-pointer text-left border ${
                  isActive
                    ? 'bg-[#151d35] border-indigo-500/50 text-white shadow-sm shadow-indigo-500/5'
                    : 'bg-transparent border-transparent hover:bg-slate-800/40 text-slate-300 hover:text-white'
                }`}
              >
                {/* Active left indicator bar */}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-2 bottom-2 w-1 bg-indigo-500 rounded-r-full"
                  />
                )}

                <div className="min-w-0 flex-1 pr-2">
                  {isEditing ? (
                    <form
                      onSubmit={(e) => handleSaveRename(conv.id, e)}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1"
                    >
                      <input
                        ref={editInputRef}
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        className="w-full bg-[#0a0f1e] border border-indigo-500 text-xs px-2 py-1 rounded text-white focus:outline-none"
                      />
                      <button
                        type="submit"
                        style={{ cursor: 'pointer' }}
                        className="p-1 text-emerald-400 hover:text-emerald-300"
                        title="Save"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelRename}
                        style={{ cursor: 'pointer' }}
                        className="p-1 text-slate-400 hover:text-white"
                        title="Cancel"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  ) : isDeleting ? (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center justify-between gap-1 text-[11px] text-red-300 py-0.5"
                    >
                      <span className="truncate">Delete chat?</span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          type="button"
                          onClick={(e) => handleConfirmDelete(conv.id, e)}
                          style={{ cursor: 'pointer' }}
                          className="px-1.5 py-0.5 bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/30 rounded text-[10px] font-semibold"
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingId(null);
                          }}
                          style={{ cursor: 'pointer' }}
                          className="px-1.5 py-0.5 text-slate-400 hover:text-white text-[10px]"
                        >
                          No
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs font-medium truncate leading-snug">
                        {conv.title}
                      </p>
                      <div className="flex items-center gap-1 mt-0.5 text-[10px] text-slate-500">
                        <Clock className="w-2.5 h-2.5" />
                        <span>{formatRelativeTime(conv.updated_at)}</span>
                      </div>
                    </>
                  )}
                </div>

                {/* Action buttons (Rename & Delete) on hover or active */}
                {!isEditing && !isDeleting && (
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button
                      type="button"
                      onClick={(e) => handleStartRename(conv, e)}
                      style={{ cursor: 'pointer' }}
                      title="Rename conversation"
                      aria-label={`Rename ${conv.title}`}
                      className="p-1 rounded-md text-slate-400 hover:text-indigo-300 hover:bg-slate-700/60 transition"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingId(conv.id);
                        setEditingId(null);
                      }}
                      style={{ cursor: 'pointer' }}
                      title="Delete conversation"
                      aria-label={`Delete ${conv.title}`}
                      className="p-1 rounded-md text-slate-400 hover:text-red-400 hover:bg-slate-700/60 transition"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden md:flex h-full flex-col">
        {content}
      </aside>

      {/* Mobile Slide-Over Drawer */}
      <AnimatePresence>
        {isOpenMobile && (
          <div className="fixed inset-0 z-50 flex md:hidden">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onCloseMobile}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
              aria-hidden="true"
            />

            {/* Slide-over Panel */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 280 }}
              className="relative z-10 h-full shadow-2xl"
            >
              {content}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

