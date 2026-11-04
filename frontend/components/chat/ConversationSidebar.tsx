'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Loader2,
  MessageSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Conversation } from '@/types';
import api from '@/lib/api';
import { toast } from 'sonner';
import clsx from 'clsx';

export interface ConversationSidebarProps {
  activeId: string | null;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  refreshTrigger?: number;
}

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
    if (diffMin < 60) return `${diffMin}m`;
    if (diffHour < 24) return `${diffHour}h`;
    if (diffDay === 1) return 'Yesterday';
    if (diffDay < 7) return `${diffDay}d`;

    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return '';
  }
}

interface ConversationGroup {
  label: string;
  items: Conversation[];
}

function groupConversations(list: Conversation[]): ConversationGroup[] {
  const today: Conversation[] = [];
  const yesterday: Conversation[] = [];
  const earlier: Conversation[] = [];

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;

  for (const c of list) {
    const time = new Date(c.updated_at || c.created_at).getTime();
    if (time >= todayStart) {
      today.push(c);
    } else if (time >= yesterdayStart) {
      yesterday.push(c);
    } else {
      earlier.push(c);
    }
  }

  return [
    { label: 'Today', items: today },
    { label: 'Yesterday', items: yesterday },
    { label: 'Earlier', items: earlier },
  ].filter((g) => g.items.length > 0);
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

  const grouped = useMemo(() => groupConversations(conversations), [conversations]);

  const sidebarContent = (
    <div className="flex flex-col h-full bg-sidebar border-r border-border w-[264px] flex-shrink-0 select-none">
      {/* Top Action Header */}
      <div className="p-3 border-b border-border space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-3.5 h-3.5 text-text-muted" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              History
            </span>
          </div>
          {isOpenMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              className="p-1 rounded-control text-text-muted hover:text-text-primary hover:bg-surface-2 transition md:hidden"
              aria-label="Close conversation list"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Clean 36px Accent-Fill "New chat" button */}
        <button
          type="button"
          onClick={() => {
            onNewChat();
            if (isOpenMobile) onCloseMobile();
          }}
          className="w-full h-9 flex items-center justify-center gap-2 bg-accent-fill hover:brightness-105 active:scale-[0.98] text-accent-text font-medium text-xs rounded-control shadow-subtle transition-all duration-150"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>New chat</span>
        </button>
      </div>

      {/* Conversations Scroll Area */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-text-muted gap-2 text-xs">
            <Loader2 className="w-4 h-4 animate-spin text-accent" />
            <span>Loading chats…</span>
          </div>
        ) : error ? (
          <div className="p-3 text-center text-xs text-danger/90 bg-danger/10 border border-danger/20 rounded-card m-2">
            <p>{error}</p>
            <button
              type="button"
              onClick={fetchConversations}
              className="mt-2 text-2xs text-text-primary underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-12 px-3 text-text-muted">
            <p className="text-xs">No conversations yet</p>
            <p className="text-[11px] mt-1 text-text-muted/80">
              Messages will be saved here automatically.
            </p>
          </div>
        ) : (
          grouped.map((group) => (
            <div key={group.label} className="space-y-1">
              <p className="px-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((conv) => {
                  const isActive = activeId === conv.id;
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
                      className={clsx(
                        'group relative flex items-center justify-between gap-1.5 px-2.5 py-2 rounded-control text-xs cursor-pointer transition-all duration-150',
                        isActive
                          ? 'bg-surface-2 text-text-primary font-medium shadow-subtle'
                          : 'text-text-secondary hover:text-text-primary hover:bg-surface-1'
                      )}
                    >
                      {/* Active Left 2px Accent Indicator */}
                      {isActive && (
                        <div className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-accent rounded-r-full" />
                      )}

                      {/* Title or Inline Edit */}
                      <div className="flex-1 min-w-0 pr-1">
                        {isEditing ? (
                          <form
                            onSubmit={(e) => handleSaveRename(conv.id, e)}
                            className="flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              ref={editInputRef}
                              type="text"
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Escape') setEditingId(null);
                              }}
                              className="w-full bg-surface-3 border border-accent text-xs px-2 py-0.5 rounded text-text-primary focus:outline-none"
                            />
                            <button
                              type="submit"
                              className="p-1 text-accent hover:text-accent/80"
                              title="Save"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={handleCancelRename}
                              className="p-1 text-text-muted hover:text-text-primary"
                              title="Cancel"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </form>
                        ) : (
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="truncate block flex-1 text-xs">
                              {conv.title}
                            </span>
                            <span className="text-[10px] text-text-muted font-mono tabular-nums flex-shrink-0 group-hover:hidden">
                              {formatRelativeTime(conv.updated_at || conv.created_at)}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Action Icons (visible on hover / focus) */}
                      {!isEditing && (
                        <div className="hidden group-hover:flex group-focus-within:flex items-center gap-0.5 flex-shrink-0">
                          {isDeleting ? (
                            <div
                              className="flex items-center gap-1 bg-surface-3 border border-border px-1.5 py-0.5 rounded"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span className="text-[10px] text-danger font-medium">Delete?</span>
                              <button
                                type="button"
                                onClick={(e) => handleConfirmDelete(conv.id, e)}
                                className="p-0.5 text-danger hover:brightness-110"
                                title="Confirm delete"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeletingId(null);
                                }}
                                className="p-0.5 text-text-muted hover:text-text-primary"
                                title="Cancel"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={(e) => handleStartRename(conv, e)}
                                className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-3 transition"
                                title="Rename conversation"
                                aria-label="Rename conversation"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeletingId(conv.id);
                                }}
                                className="p-1 rounded text-text-muted hover:text-danger hover:bg-danger/10 transition"
                                title="Delete conversation"
                                aria-label="Delete conversation"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <div className="hidden md:block h-full flex-shrink-0">{sidebarContent}</div>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {isOpenMobile && (
          <div className="fixed inset-0 z-40 md:hidden flex">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onCloseMobile}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
              aria-hidden="true"
            />
            {/* Drawer */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="relative z-50 h-full"
            >
              {sidebarContent}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
