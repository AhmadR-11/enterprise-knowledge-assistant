'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Building2, Zap, Layers, MessageSquare, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { Space } from '@/types';
import { toast } from 'sonner';
import { useChatStream, ChatMessage } from '@/hooks/useChatStream';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { ChatInput } from '@/components/chat/ChatInput';
import { JumpToLatestButton } from '@/components/chat/JumpToLatestButton';
import { EmptyChatState } from '@/components/chat/EmptyChatState';
import { ConversationSidebar } from '@/components/chat/ConversationSidebar';

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

  // Streaming Hook with conversation persistence
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

  // Legacy Non-Streaming State (preserved for verification)
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

  // Active messages depending on mode
  const activeMessages = mode === 'streaming' ? streamMessages : nonStreamMessages;
  const isBusy = mode === 'streaming'
    ? (streamStatus === 'waiting' || streamStatus === 'streaming')
    : nonStreamSending;

  // Auto-scroll & scroll detection
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  // Fetch accessible spaces on mount
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

  // Check URL query param ?id= on initial mount to load conversation if shared or refreshed
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

  // Track if user manually scrolled away from the bottom
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsAtBottom(distanceToBottom < 60);
  }, []);

  // Auto-scroll to bottom only when user hasn't scrolled up
  useEffect(() => {
    if (isAtBottom && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeMessages, streamStatus, isAtBottom]);

  const jumpToBottom = () => {
    setIsAtBottom(true);
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Legacy non-streaming request handler
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

  // Unified send handler
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

  const handleSelectSuggestedPrompt = (prompt: string) => {
    handleSend(prompt);
  };

  const hasConversations = activeMessages.length > 1;

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#070b16]">
      {/* Conversation Sidebar / Drawer */}
      <ConversationSidebar
        activeId={conversationId}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        refreshTrigger={refreshSidebarTrigger}
      />

      {/* Main Chat Interface */}
      <main className="flex-1 flex flex-col h-full min-w-0 overflow-hidden relative">
        <div className="flex flex-col h-full p-4 md:p-6 max-w-5xl w-full mx-auto space-y-4">
          {/* Header & Space Selector + Mode Switcher */}
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-800/80 flex-wrap">
            <div className="flex items-center gap-3">
              {/* Mobile Sidebar Toggle Button */}
              <button
                type="button"
                onClick={() => setIsMobileSidebarOpen(true)}
                style={{ cursor: 'pointer' }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#151d35] hover:bg-[#1c2747] border border-slate-700/80 text-xs text-slate-300 hover:text-white md:hidden transition shadow-sm"
                aria-label="Open conversation history drawer"
              >
                <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
                <span className="font-medium">Chats</span>
              </button>

              <div>
                <h1 className="text-lg md:text-xl font-bold text-white tracking-wide flex items-center gap-2">
                  <Sparkles className="w-4 h-4 md:w-5 md:h-5 text-indigo-400" /> Ask AI / Chat
                </h1>
                <p className="text-slate-400 text-[11px] mt-0.5">
                  RAG-grounded retrieval with persistent conversations
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              {/* Mode Switcher Toggle (Verification & Fallback) */}
              <div
                role="radiogroup"
                aria-label="Generation mode"
                className="flex items-center bg-[#151d35] border border-slate-700/80 p-0.5 rounded-xl text-[11px]"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={mode === 'streaming'}
                  onClick={() => setMode('streaming')}
                  style={{ cursor: 'pointer' }}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                    mode === 'streaming'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Zap className="w-3 h-3 text-amber-300" />
                  <span>Streaming</span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={mode === 'non-streaming'}
                  onClick={() => setMode('non-streaming')}
                  style={{ cursor: 'pointer' }}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                    mode === 'non-streaming'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Layers className="w-3 h-3 text-slate-400" />
                  <span>Standard</span>
                </button>
              </div>

              {/* Space Filter Dropdown */}
              <div className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                <select
                  aria-label="Filter documents by space"
                  className="input bg-[#151d35] border-slate-700/80 text-xs py-1.5 px-3 rounded-xl text-slate-200 focus:border-indigo-500"
                  value={spaceId}
                  onChange={(e) => setSpaceId(e.target.value)}
                >
                  <option value="">All Accessible Spaces</option>
                  {spaces.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Accessible Messages Stream Container */}
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            role="log"
            aria-live="polite"
            aria-atomic="false"
            className="flex-1 overflow-y-auto space-y-4 pr-1 relative min-h-0"
          >
            {isLoadingHistory ? (
              <div className="flex flex-col items-center justify-center h-64 space-y-3 text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                <p className="text-xs">Loading chat history...</p>
              </div>
            ) : (
              <>
                <AnimatePresence initial={false}>
                  {activeMessages.map((m) => (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <MessageBubble
                        message={m}
                        onRetry={mode === 'streaming' ? retryStream : undefined}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>

                {/* Empty State with 3 Suggested Prompts when no user queries have been sent */}
                {!hasConversations && (
                  <EmptyChatState onSelectPrompt={handleSelectSuggestedPrompt} />
                )}
              </>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Floating Jump to Latest Button */}
          <JumpToLatestButton
            visible={!isAtBottom}
            onClick={jumpToBottom}
          />

          {/* Input Form with Stop/Send Switcher */}
          <div className="pt-2">
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
