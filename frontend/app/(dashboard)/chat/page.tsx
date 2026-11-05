'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, MessageSquare, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { Space } from '@/types';
import { toast } from 'sonner';
import { useChatStream, ChatMessage } from '@/hooks/useChatStream';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { ChatInput } from '@/components/chat/ChatInput';
import { JumpToLatestButton } from '@/components/chat/JumpToLatestButton';
import { EmptyChatState } from '@/components/chat/EmptyChatState';
import { ConversationSidebar } from '@/components/chat/ConversationSidebar';
import { SpaceSelector } from '@/components/chat/SpaceSelector';
import clsx from 'clsx';

export default function ChatPage() {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [spaceId, setSpaceId] = useState<string>('');
  const [input, setInput] = useState<string>('');
  const [mode, setMode] = useState<'streaming' | 'non-streaming'>('streaming');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [refreshSidebarTrigger, setRefreshSidebarTrigger] = useState(0);

  const handleConversationCreated = useCallback((conv: { id: string; title: string }) => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('id', conv.id);
      window.history.pushState({}, '', url.toString());
    }
    setRefreshSidebarTrigger((prev) => prev + 1);
  }, []);

  const {
    messages: streamMessages,
    status: streamStatus,
    conversationId,
    isLoadingHistory,
    send: sendStream,
    stop: stopStream,
    retry: retryStream,
    loadConversation,
    clearConversation
  } = useChatStream({
    onConversationCreated: handleConversationCreated,
    onStreamComplete: () => setRefreshSidebarTrigger((prev) => prev + 1)
  });

  const [nonStreamMessages, setNonStreamMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: 'Hello! I am your Enterprise AI Assistant (Non-Streaming mode). Ask me anything about documents in your assigned spaces.',
      timestamp: new Date(),
      status: 'done'
    }
  ]);
  const [nonStreamSending, setNonStreamSending] = useState(false);

  const activeMessages = mode === 'streaming' ? streamMessages : nonStreamMessages;
  const isBusy = mode === 'streaming'
    ? (streamStatus === 'waiting' || streamStatus === 'streaming')
    : nonStreamSending;

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  useEffect(() => {
    api.get('/spaces/my')
      .then((r) => {
        const fetched = r.data.data.spaces;
        setSpaces(fetched);
        if (fetched.length === 1) {
          setSpaceId(String(fetched[0].id));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlId = params.get('id');
      if (urlId) {
        loadConversation(urlId);
      }
    }
  }, [loadConversation]);

  const handleSelectConversation = (id: string) => {
    loadConversation(id);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('id', id);
      window.history.pushState({}, '', url.toString());
    }
  };

  const handleNewChat = () => {
    clearConversation();
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('id');
      window.history.pushState({}, '', url.toString());
    }
  };

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsAtBottom(distanceToBottom < 60);
  }, []);

  useEffect(() => {
    if (isAtBottom && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeMessages, streamStatus, isAtBottom]);

  const jumpToBottom = () => {
    setIsAtBottom(true);
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendNonStreaming = async (textToSend?: string) => {
    const userQ = (textToSend ?? input).trim();
    if (!userQ || nonStreamSending) return;
    setInput('');

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: userQ,
      timestamp: new Date()
    };
    const waitingMsg: ChatMessage = {
      id: `asst-${Date.now()}`,
      sender: 'assistant',
      text: '',
      timestamp: new Date(),
      status: 'waiting'
    };

    setNonStreamMessages((prev) => [...prev, userMsg, waitingMsg]);
    setNonStreamSending(true);

    try {
      const { data } = await api.post('/chat', {
        question: userQ,
        spaceId: spaceId ? parseInt(spaceId, 10) : undefined,
        conversationId: conversationId || undefined
      });

      if (data.data?.conversationId) {
        handleConversationCreated({ id: data.data.conversationId, title: data.data.conversationTitle });
      }

      setNonStreamMessages((prev) =>
        prev.map((m) =>
          m.id === waitingMsg.id
            ? {
                ...m,
                text: data.data.answer,
                sources: data.data.sources,
                status: 'done'
              }
            : m
        )
      );
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      const msg = err.response?.data?.message || 'Failed to get answer from AI';
      toast.error(msg);
      setNonStreamMessages((prev) =>
        prev.map((m) =>
          m.id === waitingMsg.id
            ? {
                ...m,
                status: 'error',
                error: msg
              }
            : m
        )
      );
    } finally {
      setNonStreamSending(false);
    }
  };

  const handleSend = (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || isBusy) return;

    if (mode === 'streaming') {
      setInput('');
      sendStream(text, {
        spaceId: spaceId ? parseInt(spaceId, 10) : undefined
      });
    } else {
      handleSendNonStreaming(text);
    }
  };

  const hasConversations = activeMessages.length > 1;

  return (
    <div className="flex h-full w-full overflow-hidden bg-bg">
      {/* Chat History Panel */}
      <ConversationSidebar
        activeId={conversationId}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        refreshTrigger={refreshSidebarTrigger}
      />

      {/* Main Chat Canvas */}
      <main className="flex-1 flex flex-col h-full min-w-0 overflow-hidden relative bg-bg">
        {/* Header Bar */}
        <header className="h-14 border-b border-border px-4 md:px-6 flex items-center justify-between gap-3 bg-bg flex-shrink-0 z-10">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 min-h-[36px] rounded-control bg-surface-2 border border-border text-xs text-text-secondary hover:text-text-primary hover:bg-surface-3 active:bg-surface-3 disabled:opacity-50 disabled:cursor-not-allowed lg:hidden transition-colors duration-150 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-label="Open conversation history drawer"
            >
              <MessageSquare className="w-3.5 h-3.5 text-text-muted" />
              <span>Chats</span>
            </button>

            <div>
              <h1 className="text-[20px] font-semibold text-text-primary tracking-tight flex items-center gap-2">
                <span>Ask AI / Chat</span>
              </h1>
              <p className="text-text-muted text-xs truncate hidden sm:block">
                RAG-grounded retrieval with persistent conversations
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Mode Segmented Control */}
            <div
              role="radiogroup"
              aria-label="Generation mode"
              className="flex items-center bg-surface-2 border border-border p-0.5 rounded-control text-xs"
            >
              <button
                type="button"
                role="radio"
                aria-checked={mode === 'streaming'}
                onClick={() => setMode('streaming')}
                className={clsx(
                  'flex items-center gap-1.5 px-2.5 py-1 min-h-[30px] rounded-[6px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:cursor-not-allowed',
                  mode === 'streaming'
                    ? 'bg-surface-3 text-text-primary border border-border-strong shadow-sm'
                    : 'text-text-muted hover:text-text-secondary active:bg-surface-3'
                )}
              >
                {mode === 'streaming' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                )}
                <span>Streaming</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={mode === 'non-streaming'}
                onClick={() => setMode('non-streaming')}
                className={clsx(
                  'flex items-center gap-1.5 px-2.5 py-1 min-h-[30px] rounded-[6px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:cursor-not-allowed',
                  mode === 'non-streaming'
                    ? 'bg-surface-3 text-text-primary border border-border-strong shadow-sm'
                    : 'text-text-muted hover:text-text-secondary active:bg-surface-3'
                )}
              >
                {mode === 'non-streaming' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                )}
                <span>Standard</span>
              </button>
            </div>

            {/* Custom Popover Space Selector */}
            <SpaceSelector
              spaces={spaces}
              selectedSpaceId={spaceId}
              onSelectSpace={setSpaceId}
            />
          </div>
        </header>

        {/* Message Column: centered max-width 760px */}
        <div className="flex-1 flex flex-col min-h-0 relative">
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            role="log"
            aria-live="polite"
            aria-atomic="false"
            className="flex-1 overflow-y-auto px-4 md:px-0 py-6"
          >
            <div className="max-w-[760px] mx-auto w-full space-y-6">
              {isLoadingHistory ? (
                <div className="flex flex-col items-center justify-center py-24 space-y-2.5 text-text-muted">
                  <Loader2 className="w-5 h-5 animate-spin motion-reduce:animate-none text-accent" />
                  <p className="text-xs">Loading chat history…</p>
                </div>
              ) : (
                <>
                  <AnimatePresence initial={false}>
                    {activeMessages.map((m) => (
                      <motion.div
                        key={m.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.15, ease: 'easeOut' }}
                      >
                        <MessageBubble
                          message={m}
                          onRetry={mode === 'streaming' ? retryStream : undefined}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>

                  {!hasConversations && (
                    <EmptyChatState onSelectPrompt={(prompt) => setInput(prompt)} />
                  )}
                </>
              )}

              <div ref={messagesEndRef} className="h-6" />
            </div>
          </div>

          {/* 32px soft fade mask above the composer */}
          <div
            className="pointer-events-none h-8 -mt-8 bg-gradient-to-t from-bg to-transparent relative z-10 w-full flex-shrink-0"
            aria-hidden="true"
          />

          {/* Floating Jump to Latest Button (centered 12px above composer) */}
          <JumpToLatestButton visible={!isAtBottom} onClick={jumpToBottom} />

          {/* Composer Footer (Floating, max-w 760px) */}
          <div className="px-4 pb-4 pt-1 bg-bg flex-shrink-0 z-10">
            <ChatInput
              input={input}
              onChange={setInput}
              onSend={() => handleSend()}
              onStop={stopStream}
              status={mode === 'streaming' ? streamStatus : (nonStreamSending ? 'waiting' : 'idle')}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
